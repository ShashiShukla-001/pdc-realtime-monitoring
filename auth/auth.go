// Package auth checks the dashboard session cookie and the caller's role.
// The PMU read path does not import this package.
package auth

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"sync"
	"time"

	"pdc/store"
)

const cookieName = "pdc_session"

type ctxKey struct{}

// User is the logged-in account for this request.
type User struct {
	Email string `json:"email"`
	Role  string `json:"role"`
}

func WithUser(ctx context.Context, u User) context.Context {
	return context.WithValue(ctx, ctxKey{}, u)
}

// Current returns the user placed on the request by the gate.
func Current(r *http.Request) (User, bool) {
	u, ok := r.Context().Value(ctxKey{}).(User)
	return u, ok && u.Email != ""
}

// Allows reports whether have may perform a call that needs min.
func Allows(have, min string) bool {
	return rank(have) >= rank(min) && rank(min) > 0
}

func rank(role string) int {
	switch role {
	case "superadmin":
		return 4
	case "admin":
		return 3
	case "operator":
		return 2
	case "viewer":
		return 1
	default:
		return 0
	}
}

var sessionDB *store.Store

func bindSessionDB(db *store.Store) {
	if db != nil {
		sessionDB = db
	}
}

// Alive re-reads the session row. Chart streams call this about once a minute.
func Alive(r *http.Request) bool {
	if sessionDB == nil {
		return false
	}
	_, ok := load(sessionDB, r)
	return ok
}

func load(db *store.Store, r *http.Request) (User, bool) {
	c, err := r.Cookie(cookieName)
	if err != nil || c.Value == "" {
		return User{}, false
	}
	su, err := db.LookupSession(r.Context(), c.Value)
	if err != nil {
		return User{}, false
	}
	return User{Email: su.Email, Role: su.Role}, true
}

func deny(w http.ResponseWriter, status int, msg string) {
	http.Error(w, msg, status)
}

// WrapAPI requires a session on the device API. POST /api/login stays open.
func WrapAPI(db *store.Store, next http.Handler) http.Handler {
	bindSessionDB(db)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions || (r.URL.Path == "/api/login" && r.Method == http.MethodPost) {
			next.ServeHTTP(w, r)
			return
		}
		u, ok := load(db, r)
		if !ok {
			deny(w, http.StatusUnauthorized, "login required")
			return
		}
		if !Allows(u.Role, apiMinRole(r)) {
			deny(w, http.StatusForbidden, "not allowed")
			return
		}
		next.ServeHTTP(w, r.WithContext(WithUser(r.Context(), u)))
	})
}

func apiMinRole(r *http.Request) string {
	p := r.URL.Path
	switch {
	case p == "/api/me" || p == "/api/logout" || p == "/api/me/password":
		return "viewer"
	case p == "/api/audit":
		return "superadmin"
	case strings.HasPrefix(p, "/api/accounts/") && strings.HasSuffix(p, "/password"):
		return "superadmin"
	case strings.HasPrefix(p, "/api/accounts"):
		return "admin"
	case p == "/api/pmus" && r.Method == http.MethodGet:
		return "viewer"
	case p == "/api/pmus" && (r.Method == http.MethodPost || r.Method == http.MethodPut):
		return "admin"
	case r.Method == http.MethodPost && (strings.HasSuffix(p, "/connect") || strings.HasSuffix(p, "/disconnect")):
		return "operator"
	case r.Method == http.MethodDelete:
		return "admin"
	default:
		return "admin"
	}
}

// WrapLive requires a session on the dashboard feed. /metrics stays open.
func WrapLive(db *store.Store, next http.Handler) http.Handler {
	bindSessionDB(db)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/metrics" || r.Method == http.MethodOptions {
			next.ServeHTTP(w, r)
			return
		}
		u, ok := load(db, r)
		if !ok {
			deny(w, http.StatusUnauthorized, "login required")
			return
		}
		need := "viewer"
		if adminLivePath(r.URL.Path) {
			need = "admin"
		}
		if !Allows(u.Role, need) {
			deny(w, http.StatusForbidden, "not allowed")
			return
		}
		next.ServeHTTP(w, r.WithContext(WithUser(r.Context(), u)))
	})
}

func adminLivePath(p string) bool {
	switch {
	case strings.HasPrefix(p, "/conversation/aligner"):
		return true
	case strings.HasPrefix(p, "/conversation/aligned-samples"):
		return true
	case strings.HasPrefix(p, "/conversation/frame-capture"):
		return true
	case strings.HasPrefix(p, "/conversation/frame-diag"):
		return true
	default:
		return false
	}
}

func setCookie(w http.ResponseWriter, id string) {
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    id,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
}

func clearCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
}

type loginBody struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

var (
	failMu sync.Mutex
	fails  = map[string][]time.Time{}
)

func limited(username string) bool {
	failMu.Lock()
	defer failMu.Unlock()
	now := time.Now()
	cut := now.Add(-time.Minute)
	prev := fails[username]
	kept := prev[:0]
	for _, t := range prev {
		if t.After(cut) {
			kept = append(kept, t)
		}
	}
	fails[username] = kept
	return len(kept) >= 8
}

func noteFail(username string) {
	failMu.Lock()
	defer failMu.Unlock()
	fails[username] = append(fails[username], time.Now())
}

// Login checks the password and sets the session cookie.
func Login(db *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
			return
		}
		var body loginBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid email or password", http.StatusUnauthorized)
			return
		}
		name := strings.ToLower(strings.TrimSpace(body.Email))
		if limited(name) {
			http.Error(w, "invalid email or password", http.StatusUnauthorized)
			return
		}
		acc, err := db.UserByPassword(r.Context(), body.Email, body.Password)
		if err != nil {
			noteFail(name)
			http.Error(w, "invalid email or password", http.StatusUnauthorized)
			return
		}
		id, _, err := db.CreateSession(r.Context(), acc.Email)
		if err != nil {
			http.Error(w, "login unavailable", http.StatusServiceUnavailable)
			return
		}
		setCookie(w, id)
		db.Audit(r.Context(), acc.Email, "login", acc.Email, "")
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(User{Email: acc.Email, Role: acc.Role})
	}
}

// Logout deletes the session row and clears the cookie.
func Logout(db *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
			return
		}
		if c, err := r.Cookie(cookieName); err == nil {
			db.DeleteSession(r.Context(), c.Value)
		}
		clearCookie(w)
		w.WriteHeader(http.StatusNoContent)
	}
}

// Me returns the email and role for the current cookie.
func Me(db *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
			return
		}
		u, ok := Current(r)
		if !ok {
			u, ok = load(db, r)
		}
		if !ok {
			http.Error(w, "login required", http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(u)
	}
}

type accountBody struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Role     string `json:"role"`
}

// Accounts lists accounts and creates one. Admin only; the gate enforces that.
func Accounts(db *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			list, err := db.ListUsers(r.Context())
			if err != nil {
				http.Error(w, "account list unavailable", http.StatusServiceUnavailable)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(list)
		case http.MethodPost:
			var body accountBody
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				http.Error(w, "invalid account", http.StatusBadRequest)
				return
			}
			actor, _ := Current(r)
			if (body.Role == "admin" || body.Role == "superadmin") && actor.Role != "superadmin" {
				http.Error(w, "only a super admin can add an admin", http.StatusForbidden)
				return
			}
			acc, err := db.CreateUser(r.Context(), body.Email, body.Password, body.Role, actor.Email)
			if err != nil {
				status := http.StatusBadRequest
				if errors.Is(err, store.ErrEmailTaken) {
					status = http.StatusConflict
				}
				http.Error(w, err.Error(), status)
				return
			}
			db.Audit(r.Context(), actor.Email, "add_account", acc.Email, acc.Role)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusCreated)
			_ = json.NewEncoder(w).Encode(acc)
		default:
			http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		}
	}
}

func actorEmail(r *http.Request) string {
	if u, ok := Current(r); ok {
		return u.Email
	}
	return ""
}

func actorRole(r *http.Request) string {
	if u, ok := Current(r); ok {
		return u.Role
	}
	return ""
}

// AccountOne deletes an account, or sets a new password when the path ends in /password.
func AccountOne(db *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		name := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/accounts/"), "/")
		if strings.HasSuffix(name, "/password") {
			if r.Method != http.MethodPost {
				http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
				return
			}
			email := strings.Trim(strings.TrimSuffix(name, "/password"), "/")
			var body struct {
				Password string `json:"password"`
			}
			if email == "" || json.NewDecoder(r.Body).Decode(&body) != nil {
				http.Error(w, "invalid account", http.StatusBadRequest)
				return
			}
			if err := db.SetPassword(r.Context(), email, body.Password); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			if actor, ok := Current(r); ok {
				db.Audit(r.Context(), actor.Email, "reset_password", email, "")
			}
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != http.MethodDelete {
			http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
			return
		}
		if name == "" {
			http.Error(w, "missing account", http.StatusBadRequest)
			return
		}
		if err := db.DeleteUser(r.Context(), name, actorEmail(r), actorRole(r)); err != nil {
			if errors.Is(err, store.ErrAdminRemoval) || errors.Is(err, store.ErrLastSuperAdmin) || errors.Is(err, store.ErrSelfRemoval) {
				http.Error(w, err.Error(), http.StatusForbidden)
				return
			}
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if actor, ok := Current(r); ok {
			db.Audit(r.Context(), actor.Email, "remove_account", name, "")
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// ChangePassword lets the signed-in person replace their own password.
func ChangePassword(db *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
			return
		}
		var body struct {
			CurrentPassword string `json:"currentPassword"`
			NewPassword     string `json:"newPassword"`
		}
		if json.NewDecoder(r.Body).Decode(&body) != nil {
			http.Error(w, "invalid password", http.StatusBadRequest)
			return
		}
		actor, ok := Current(r)
		if !ok {
			http.Error(w, "login required", http.StatusUnauthorized)
			return
		}
		if err := db.ChangePassword(r.Context(), actor.Email, body.CurrentPassword, body.NewPassword); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		db.Audit(r.Context(), actor.Email, "change_password", actor.Email, "")
		w.WriteHeader(http.StatusNoContent)
	}
}

// AuditList returns recent account and device actions for a super admin.
func AuditList(db *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
			return
		}
		list, err := db.ListAudit(r.Context(), 100)
		if err != nil {
			http.Error(w, "audit list unavailable", http.StatusServiceUnavailable)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(list)
	}
}
