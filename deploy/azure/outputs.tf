output "url" {
  description = "Open this and create the first admin account."
  value       = local.public_url
}

output "oidc_redirect_uri" {
  description = "Register this redirect URI at your identity provider."
  value       = "${local.public_url}/api/auth/oidc/callback"
}
