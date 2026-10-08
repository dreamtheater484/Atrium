output "load_balancer_dns" {
  description = "Point your domain's DNS (CNAME or alias) at this name."
  value       = aws_lb.atrium.dns_name
}

output "oidc_redirect_uri" {
  description = "Register this redirect URI at your identity provider."
  value       = "${var.public_url}/api/auth/oidc/callback"
}
