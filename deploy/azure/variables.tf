variable "name" {
  description = "Short name used for every resource, e.g. atrium-acme (lowercase letters, digits, hyphens)."
  type        = string
}

variable "image" {
  description = "The Atrium container image, e.g. ghcr.io/your-org/atrium:0.1.0."
  type        = string
}

variable "location" {
  type    = string
  default = "westeurope"
}

variable "workspace_name" {
  type    = string
  default = "Atrium"
}

variable "db_sku" {
  description = "Burstable B1ms is plenty for a team of architects."
  type        = string
  default     = "B_Standard_B1ms"
}

variable "custom_domain" {
  description = "Optional custom domain you will bind to the container app."
  type        = string
  default     = ""
}

variable "oidc_issuer" {
  description = "Optional single sign-on, e.g. https://login.microsoftonline.com/<tenant-id>/v2.0"
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
