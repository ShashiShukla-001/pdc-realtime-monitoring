package store

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"golang.org/x/crypto/bcrypt"
)

const SessionLifetime = 12 * time.Hour

// ErrAdminRemoval means someone other than a super admin tried to delete an admin.
var ErrAdminRemoval = errors.New("only a super admin can remove an admin")

// ErrLastSuperAdmin means the website tried to delete a super admin.
var ErrLastSuperAdmin = errors.New("a super admin cannot be removed from the website")

// ErrSelfRemoval means the signed-in person tried to delete their own account.
var ErrSelfRemoval = errors.New("you cannot remove your own account")

// ErrEmailTaken means that email is already an account.
var ErrEmailTaken = errors.New("email is already in use")

// Account is a dashboard user. The password hash is never included.
type Account struct {
	Email     string    `json:"email"`
	Role      string    `json:"role"`
	CreatedBy string    `json:"createdBy"`
	CreatedAt time.Time `json:"createdAt"`
}

// SessionUser is the person behind a session id.
type SessionUser struct {
	Email    string
	Role     string
	Expires  time.Time
	LastSeen time.Time
}

var (
	emailPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9._%+\-]*@[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?)+$`)
	dummyHash    []byte
)

func init() {
	var err error
	dummyHash, err = bcrypt.GenerateFromPassword([]byte("dummy-password-not-used"), bcrypt.DefaultCost)
	if err != nil {
		panic(err)
	}
}

func normalizeEmail(name string) (string, error) {
	name = strings.ToLower(strings.TrimSpace(name))
	if len(name) > 254 || !emailPattern.MatchString(name) {
		return "", fmt.Errorf("enter a valid email address")
	}
	return name, nil
}

// normalizeLogin accepts an email and the first admin id created before emails.
func normalizeLogin(name string) (string, error) {
	name = strings.ToLower(strings.TrimSpace(name))
	if name == "" || len(name) > 254 {
		return "", fmt.Errorf("invalid email or password")
	}
	return name, nil
}

type emailTakenError struct {
	email string
}

func (e emailTakenError) Error() string {
	return "email " + e.email + " is already in use"
}

func (e emailTakenError) Unwrap() error {
	return ErrEmailTaken
}

func emailTaken(err error, email string) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return emailTakenError{email: email}
	}
	return nil
}

func validRole(role string) bool {
	switch role {
	case "viewer", "operator", "admin", "superadmin":
		return true
	default:
		return false
	}
}

// BootstrapAdmin creates the first admin from the environment when none exists.
// A later start ignores those settings. The password is not logged.
func (s *Store) BootstrapAdmin(ctx context.Context) error {
	pool, err := s.getPool()
	if err != nil {
		return err
	}
	var n int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM app_user WHERE role = 'superadmin' AND is_active`).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		return nil
	}
	user := strings.TrimSpace(os.Getenv("PDC_BOOTSTRAP_ADMIN_EMAIL"))
	if user == "" {
		user = strings.TrimSpace(os.Getenv("PDC_BOOTSTRAP_ADMIN_USER"))
	}
	pass := os.Getenv("PDC_BOOTSTRAP_ADMIN_PASSWORD")
	if user == "" || strings.TrimSpace(pass) == "" {
		log.Printf("auth: no admin yet; set PDC_BOOTSTRAP_ADMIN_EMAIL and PDC_BOOTSTRAP_ADMIN_PASSWORD in .env")
		return nil
	}
	if _, err := s.CreateUser(ctx, user, pass, "superadmin", "machine"); err != nil {
		return err
	}
	log.Printf("auth: created bootstrap super admin %s", strings.ToLower(user))
	return nil
}

// CreateUser stores a hashed password. The plain password is not kept.
func (s *Store) CreateUser(ctx context.Context, email, password, role, createdBy string) (Account, error) {
	var zero Account
	email, err := normalizeEmail(email)
	if err != nil {
		return zero, err
	}
	if !validRole(role) {
		return zero, fmt.Errorf("role must be viewer, operator, or admin")
	}
	if len(password) < 8 {
		return zero, fmt.Errorf("password must be at least 8 characters")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return zero, err
	}
	pool, err := s.getPool()
	if err != nil {
		return zero, err
	}
	var created time.Time
	err = pool.QueryRow(ctx, `
		INSERT INTO app_user (email, password_hash, role, created_by)
		VALUES ($1, $2, $3, $4)
		RETURNING created_at`,
		email, string(hash), role, strings.TrimSpace(createdBy),
	).Scan(&created)
	if err != nil {
		if taken := emailTaken(err, email); taken != nil {
			return s.reactivate(ctx, email, string(hash), role, strings.TrimSpace(createdBy))
		}
		return zero, err
	}
	return Account{Email: email, Role: role, CreatedBy: createdBy, CreatedAt: created}, nil
}

// reactivate turns a removed account back on when the same email is added again.
func (s *Store) reactivate(ctx context.Context, email, hash, role, createdBy string) (Account, error) {
	var zero Account
	pool, err := s.getPool()
	if err != nil {
		return zero, err
	}
	var created time.Time
	err = pool.QueryRow(ctx, `
		UPDATE app_user
		SET password_hash = $2, role = $3, created_by = $4, is_active = TRUE
		WHERE email = $1 AND NOT is_active
		RETURNING created_at`,
		email, hash, role, createdBy,
	).Scan(&created)
	if err != nil {
		return zero, emailTakenError{email: email}
	}
	return Account{Email: email, Role: role, CreatedBy: createdBy, CreatedAt: created}, nil
}

// UserByPassword checks the email and password. Missing and wrong both fail.
func (s *Store) UserByPassword(ctx context.Context, email, password string) (Account, error) {
	var zero Account
	email, err := normalizeLogin(email)
	if err != nil {
		return zero, err
	}
	pool, err := s.getPool()
	if err != nil {
		return zero, err
	}
	var hash, role, createdBy string
	var created time.Time
	var active bool
	err = pool.QueryRow(ctx, `
		SELECT password_hash, role, created_by, created_at, is_active
		FROM app_user WHERE email = $1`, email).Scan(&hash, &role, &createdBy, &created, &active)
	if err != nil {
		_ = bcrypt.CompareHashAndPassword(dummyHash, []byte(password))
		return zero, fmt.Errorf("invalid email or password")
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) != nil || !active {
		return zero, fmt.Errorf("invalid email or password")
	}
	return Account{Email: email, Role: role, CreatedBy: createdBy, CreatedAt: created}, nil
}

// ListUsers returns every account without password hashes.
func (s *Store) ListUsers(ctx context.Context) ([]Account, error) {
	pool, err := s.getPool()
	if err != nil {
		return nil, err
	}
	rows, err := pool.Query(ctx, `
		SELECT email, role, created_by, created_at
		FROM app_user WHERE is_active ORDER BY email`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Account
	for rows.Next() {
		var a Account
		if err := rows.Scan(&a.Email, &a.Role, &a.CreatedBy, &a.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	if out == nil {
		out = []Account{}
	}
	return out, rows.Err()
}

// DeleteUser removes an account. A super admin removes admins. The last super admin stays.
func (s *Store) DeleteUser(ctx context.Context, email, actorEmail, actorRole string) error {
	email, err := normalizeLogin(email)
	if err != nil {
		return fmt.Errorf("account not found")
	}
	actorEmail, err = normalizeLogin(actorEmail)
	if err != nil {
		return fmt.Errorf("account not found")
	}
	if email == actorEmail {
		return ErrSelfRemoval
	}
	pool, err := s.getPool()
	if err != nil {
		return err
	}
	var role string
	err = pool.QueryRow(ctx, `SELECT role FROM app_user WHERE email = $1 AND is_active`, email).Scan(&role)
	if err != nil {
		return fmt.Errorf("account not found")
	}
	switch role {
	case "viewer", "operator":
		if actorRole != "admin" && actorRole != "superadmin" {
			return fmt.Errorf("not allowed")
		}
	case "admin":
		if actorRole != "superadmin" {
			return ErrAdminRemoval
		}
	case "superadmin":
		return ErrLastSuperAdmin
	default:
		return fmt.Errorf("account not found")
	}
	_, err = pool.Exec(ctx, `UPDATE app_user SET is_active = FALSE WHERE email = $1`, email)
	if err != nil {
		return err
	}
	_, _ = pool.Exec(ctx, `DELETE FROM app_session WHERE email = $1`, email)
	return nil
}

// ChangePassword checks the current password, then stores a new hash.
func (s *Store) ChangePassword(ctx context.Context, email, current, next string) error {
	email, err := normalizeLogin(email)
	if err != nil {
		return fmt.Errorf("the current password is wrong")
	}
	if len(next) < 8 {
		return fmt.Errorf("password must be at least 8 characters")
	}
	pool, err := s.getPool()
	if err != nil {
		return err
	}
	var hash string
	err = pool.QueryRow(ctx, `SELECT password_hash FROM app_user WHERE email = $1 AND is_active`, email).Scan(&hash)
	if err != nil || bcrypt.CompareHashAndPassword([]byte(hash), []byte(current)) != nil {
		_ = bcrypt.CompareHashAndPassword(dummyHash, []byte(current))
		return fmt.Errorf("the current password is wrong")
	}
	nextHash, err := bcrypt.GenerateFromPassword([]byte(next), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	_, err = pool.Exec(ctx, `UPDATE app_user SET password_hash = $2 WHERE email = $1`, email, string(nextHash))
	return err
}

// SetPassword stores a new hash without the old password. The caller must be a super admin.
func (s *Store) SetPassword(ctx context.Context, email, next string) error {
	email, err := normalizeEmail(email)
	if err != nil {
		return err
	}
	if len(next) < 8 {
		return fmt.Errorf("password must be at least 8 characters")
	}
	pool, err := s.getPool()
	if err != nil {
		return err
	}
	nextHash, err := bcrypt.GenerateFromPassword([]byte(next), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	tag, err := pool.Exec(ctx, `UPDATE app_user SET password_hash = $2 WHERE email = $1 AND is_active`, email, string(nextHash))
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("account not found")
	}
	return nil
}

// CreateSession inserts a visit row and returns its id.
func (s *Store) CreateSession(ctx context.Context, email string) (string, time.Time, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", time.Time{}, err
	}
	id := hex.EncodeToString(buf)
	exp := time.Now().Add(SessionLifetime)
	pool, err := s.getPool()
	if err != nil {
		return "", time.Time{}, err
	}
	_, err = pool.Exec(ctx, `
		INSERT INTO app_session (id, email, expires_at, last_seen_at)
		VALUES ($1, $2, $3, NOW())`, id, email, exp)
	if err != nil {
		return "", time.Time{}, err
	}
	return id, exp, nil
}

// LookupSession loads the user for a session id.
// A row older than a minute has its expiry pushed out by 12 hours.
func (s *Store) LookupSession(ctx context.Context, id string) (SessionUser, error) {
	var zero SessionUser
	id = strings.TrimSpace(id)
	if id == "" {
		return zero, fmt.Errorf("missing session")
	}
	pool, err := s.getPool()
	if err != nil {
		return zero, err
	}
	var u SessionUser
	err = pool.QueryRow(ctx, `
		SELECT u.email, u.role, s.expires_at, s.last_seen_at
		FROM app_session s
		JOIN app_user u ON u.email = s.email AND u.is_active
		WHERE s.id = $1`, id).Scan(&u.Email, &u.Role, &u.Expires, &u.LastSeen)
	if err != nil {
		return zero, fmt.Errorf("missing session")
	}
	if time.Now().After(u.Expires) {
		_, _ = pool.Exec(ctx, `DELETE FROM app_session WHERE id = $1`, id)
		return zero, fmt.Errorf("session expired")
	}
	if time.Since(u.LastSeen) >= time.Minute {
		exp := time.Now().Add(SessionLifetime)
		_, _ = pool.Exec(ctx, `
			UPDATE app_session SET last_seen_at = NOW(), expires_at = $2 WHERE id = $1`, id, exp)
		u.Expires = exp
		u.LastSeen = time.Now()
	}
	return u, nil
}

// DeleteSession removes one visit.
func (s *Store) DeleteSession(ctx context.Context, id string) {
	pool, err := s.getPool()
	if err != nil {
		return
	}
	_, _ = pool.Exec(ctx, `DELETE FROM app_session WHERE id = $1`, strings.TrimSpace(id))
}

// Audit records who changed a device or an account. It never stores a password.
func (s *Store) Audit(ctx context.Context, email, action, target, note string) {
	pool, err := s.getPool()
	if err != nil {
		log.Printf("audit: %v", err)
		return
	}
	_, err = pool.Exec(ctx, `
		INSERT INTO audit_event (email, action, target, detail)
		VALUES ($1, $2, $3, jsonb_build_object('note', $4::text))`,
		email, action, target, note)
	if err != nil {
		log.Printf("audit %s %s: %v", action, target, err)
	}
}

// AuditRow is one saved account or device action. The note never holds a password.
type AuditRow struct {
	ID     int64     `json:"id"`
	Time   time.Time `json:"time"`
	Email  string    `json:"email"`
	Action string    `json:"action"`
	Target string    `json:"target"`
	Note   string    `json:"note"`
}

// ListAudit returns the newest saved actions.
func (s *Store) ListAudit(ctx context.Context, limit int) ([]AuditRow, error) {
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	pool, err := s.getPool()
	if err != nil {
		return nil, err
	}
	rows, err := pool.Query(ctx, `
		SELECT id, time, email, action, target, COALESCE(detail->>'note', '')
		FROM audit_event
		ORDER BY time DESC
		LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AuditRow{}
	for rows.Next() {
		var row AuditRow
		if err := rows.Scan(&row.ID, &row.Time, &row.Email, &row.Action, &row.Target, &row.Note); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}
