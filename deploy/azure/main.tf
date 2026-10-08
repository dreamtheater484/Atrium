# Atrium on Azure: Container Apps + PostgreSQL Flexible Server.
# A small, sensible starting point. Review sizes, networking and backups for your organisation.
#
#   terraform init
#   terraform apply -var="image=ghcr.io/your-org/atrium:0.1.0" -var="name=atrium-acme"

terraform {
  required_version = ">= 1.6"
  required_providers {
    azurerm = { source = "hashicorp/azurerm", version = "~> 4.0" }
    random  = { source = "hashicorp/random", version = "~> 3.6" }
  }
}

provider "azurerm" {
  features {}
}

resource "azurerm_resource_group" "atrium" {
  name     = "${var.name}-rg"
  location = var.location
}

resource "random_password" "db" {
  length  = 32
  special = false
}

# ---------- Database ----------
resource "azurerm_postgresql_flexible_server" "db" {
  name                          = "${var.name}-db"
  resource_group_name           = azurerm_resource_group.atrium.name
  location                      = azurerm_resource_group.atrium.location
  version                       = "17"
  administrator_login           = "atrium"
  administrator_password        = random_password.db.result
  sku_name                      = var.db_sku
  storage_mb                    = 32768
  backup_retention_days         = 14
  public_network_access_enabled = true
  zone                          = "1"
}

# Atrium uses pg_trgm for fuzzy search; Azure needs it allow-listed.
resource "azurerm_postgresql_flexible_server_configuration" "extensions" {
  name      = "azure.extensions"
  server_id = azurerm_postgresql_flexible_server.db.id
  value     = "PG_TRGM"
}

resource "azurerm_postgresql_flexible_server_database" "atrium" {
  name      = "atrium"
  server_id = azurerm_postgresql_flexible_server.db.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

# Lets Azure services (the container app) reach the server. Use private networking for production.
resource "azurerm_postgresql_flexible_server_firewall_rule" "azure" {
  name             = "allow-azure-services"
  server_id        = azurerm_postgresql_flexible_server.db.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}

# ---------- App ----------
resource "azurerm_log_analytics_workspace" "logs" {
  name                = "${var.name}-logs"
  resource_group_name = azurerm_resource_group.atrium.name
  location            = azurerm_resource_group.atrium.location
  sku                 = "PerGB2018"
  retention_in_days   = 30
}

resource "azurerm_container_app_environment" "env" {
  name                       = "${var.name}-env"
  resource_group_name        = azurerm_resource_group.atrium.name
  location                   = azurerm_resource_group.atrium.location
  log_analytics_workspace_id = azurerm_log_analytics_workspace.logs.id
}

locals {
  public_url   = var.custom_domain != "" ? "https://${var.custom_domain}" : "https://${var.name}.${azurerm_container_app_environment.env.default_domain}"
  database_url = "postgres://atrium:${random_password.db.result}@${azurerm_postgresql_flexible_server.db.fqdn}:5432/atrium?sslmode=require"
}

resource "azurerm_container_app" "atrium" {
  name                         = var.name
  resource_group_name          = azurerm_resource_group.atrium.name
  container_app_environment_id = azurerm_container_app_environment.env.id
  revision_mode                = "Single"

  secret {
    name  = "database-url"
    value = local.database_url
  }
  secret {
    name  = "oidc-client-secret"
    value = var.oidc_client_secret != "" ? var.oidc_client_secret : "unused"
  }

  template {
    # One replica: live updates and the in-memory model cache assume a single server.
    min_replicas = 1
    max_replicas = 1
    container {
      name   = "atrium"
      image  = var.image
      cpu    = 0.5
      memory = "1Gi"
      env {
        name        = "DATABASE_URL"
        secret_name = "database-url"
      }
      env {
        name  = "ATRIUM_MODE"
        value = "team"
      }
      env {
        name  = "ATRIUM_PUBLIC_URL"
        value = local.public_url
      }
      env {
        name  = "ATRIUM_WORKSPACE_NAME"
        value = var.workspace_name
      }
      env {
        name  = "ATRIUM_EOL_LOOKUP"
        value = "true"
      }
      env {
        name  = "OIDC_ISSUER"
        value = var.oidc_issuer
      }
      env {
        name  = "OIDC_CLIENT_ID"
        value = var.oidc_client_id
      }
      env {
        name        = "OIDC_CLIENT_SECRET"
        secret_name = "oidc-client-secret"
      }
      liveness_probe {
        transport = "HTTP"
        port      = 7300
        path      = "/api/health"
      }
    }
  }

  ingress {
    external_enabled = true
    target_port      = 7300
    transport        = "auto"
    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }
}
