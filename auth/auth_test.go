package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAllows(t *testing.T) {
	if !Allows("admin", "viewer") || !Allows("operator", "operator") || Allows("viewer", "admin") {
		t.Fatal("role ranking")
	}
	if !Allows("superadmin", "admin") || !Allows("admin", "operator") || Allows("admin", "superadmin") {
		t.Fatal("super admin ranking")
	}
	if Allows("", "viewer") || Allows("viewer", "") {
		t.Fatal("empty role must not pass")
	}
}

func TestAPIMinRole(t *testing.T) {
	cases := []struct {
		method string
		path   string
		want   string
	}{
		{http.MethodGet, "/api/me", "viewer"},
		{http.MethodPost, "/api/logout", "viewer"},
		{http.MethodPost, "/api/me/password", "viewer"},
		{http.MethodGet, "/api/audit", "superadmin"},
		{http.MethodPost, "/api/accounts/ada@example.com/password", "superadmin"},
		{http.MethodGet, "/api/accounts", "admin"},
		{http.MethodPost, "/api/accounts", "admin"},
		{http.MethodDelete, "/api/accounts/ada@example.com", "admin"},
		{http.MethodGet, "/api/pmus", "viewer"},
		{http.MethodPost, "/api/pmus", "admin"},
		{http.MethodPut, "/api/pmus", "admin"},
		{http.MethodPost, "/api/pmus/device/connect", "operator"},
		{http.MethodPost, "/api/pmus/device/disconnect", "operator"},
		{http.MethodDelete, "/api/pmus/device", "admin"},
		{http.MethodGet, "/api/anything-else", "admin"},
	}
	for _, tc := range cases {
		req := httptest.NewRequest(tc.method, tc.path, nil)
		if got := apiMinRole(req); got != tc.want {
			t.Errorf("%s %s role = %s, want %s", tc.method, tc.path, got, tc.want)
		}
	}
}

func TestAdminLivePath(t *testing.T) {
	if !adminLivePath("/conversation/aligner-buffers") || !adminLivePath("/conversation/frame-capture") {
		t.Fatal("debug pages must require an admin")
	}
	if adminLivePath("/conversation/state") || adminLivePath("/conversation/aligned") || adminLivePath("/metrics") {
		t.Fatal("live charts and metrics must stay open to a signed-in viewer")
	}
}

func TestLoginFailureLimit(t *testing.T) {
	name := "limit-check@example.com"
	for i := 0; i < 8; i++ {
		if limited(name) {
			t.Fatalf("blocked on try %d", i+1)
		}
		noteFail(name)
	}
	if !limited(name) {
		t.Fatal("the 9th try should be blocked")
	}
}
