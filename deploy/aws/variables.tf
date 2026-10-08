variable "name" {
  description = "Short name used for every resource, e.g. atrium (lowercase letters, digits, hyphens)."
  type        = string
  default     = "atrium"
}

variable "image" {
  description = "The Atrium container image, e.g. ghcr.io/your-org/atrium:0.1.0."
  type        = string
}

variable "region" {
  type    = string
  default = "eu-west-1"
}

variable "public_url" {
  description = "The https address people will use, e.g. https://atrium.example.com (point its DNS at the load balancer)."
  type        = string
}

variable "certificate_arn" {
  description = "ACM certificate for the public URL's domain."
  type        = string
}

variable "workspace_name" {
  type    = string
  default = "Atrium"
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "oidc_issuer" {
  description = "Optional single sign-on issuer URL."
  type        = string
  default     = ""
}

variable "oidc_client_id" {
  type    = string
  default = ""
}

variable "oidc_client_secret" {
  type      = string
  default   = ""
  sensitive = true
}
