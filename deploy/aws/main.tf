# Atrium on AWS: ECS Fargate + RDS for PostgreSQL behind an Application Load Balancer.
# A small, sensible starting point in the default VPC. Review sizes, networking and backups
# for your organisation.
#
#   terraform init
#   terraform apply -var="image=ghcr.io/your-org/atrium:0.1.0" -var="certificate_arn=arn:aws:acm:..."

terraform {
  required_version = ">= 1.6"
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 6.0" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
}

provider "aws" {
  region = var.region
}

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

resource "random_password" "db" {
  length  = 32
  special = false
}

# ---------- Network rules ----------
resource "aws_security_group" "alb" {
  name   = "${var.name}-alb"
  vpc_id = data.aws_vpc.default.id
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "app" {
  name   = "${var.name}-app"
  vpc_id = data.aws_vpc.default.id
  ingress {
    from_port       = 7300
    to_port         = 7300
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "db" {
  name   = "${var.name}-db"
  vpc_id = data.aws_vpc.default.id
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }
}

# ---------- Database ----------
resource "aws_db_instance" "db" {
  identifier                = "${var.name}-db"
  engine                    = "postgres"
  engine_version            = "17"
  instance_class            = var.db_instance_class
  allocated_storage         = 20
  storage_encrypted         = true
  db_name                   = "atrium"
  username                  = "atrium"
  password                  = random_password.db.result
  vpc_security_group_ids    = [aws_security_group.db.id]
  backup_retention_period   = 14
  skip_final_snapshot       = false
  final_snapshot_identifier = "${var.name}-final"
  publicly_accessible       = false
}

resource "aws_secretsmanager_secret" "database_url" {
  name = "${var.name}/database-url"
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id     = aws_secretsmanager_secret.database_url.id
  secret_string = "postgres://atrium:${random_password.db.result}@${aws_db_instance.db.address}:5432/atrium?sslmode=require"
}

# ---------- Load balancer ----------
resource "aws_lb" "atrium" {
  name               = var.name
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = data.aws_subnets.default.ids
}

resource "aws_lb_target_group" "atrium" {
  name        = var.name
  port        = 7300
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = data.aws_vpc.default.id
  health_check {
    path    = "/api/health"
    matcher = "200"
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.atrium.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.atrium.arn
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.atrium.arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# ---------- App ----------
resource "aws_cloudwatch_log_group" "atrium" {
  name              = "/ecs/${var.name}"
  retention_in_days = 30
}

data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "${var.name}-execution"
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "secrets" {
  name = "read-database-url"
  role = aws_iam_role.execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = [aws_secretsmanager_secret.database_url.arn]
    }]
  })
}

resource "aws_ecs_cluster" "atrium" {
  name = var.name
}

locals {
  env = [
    { name = "ATRIUM_MODE", value = "team" },
    { name = "ATRIUM_PUBLIC_URL", value = var.public_url },
    { name = "ATRIUM_WORKSPACE_NAME", value = var.workspace_name },
    { name = "ATRIUM_EOL_LOOKUP", value = "true" },
    { name = "OIDC_ISSUER", value = var.oidc_issuer },
    { name = "OIDC_CLIENT_ID", value = var.oidc_client_id },
    { name = "OIDC_CLIENT_SECRET", value = var.oidc_client_secret },
  ]
}

resource "aws_ecs_task_definition" "atrium" {
  family                   = var.name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.execution.arn
  container_definitions = jsonencode([{
    name         = "atrium"
    image        = var.image
    essential    = true
    portMappings = [{ containerPort = 7300 }]
    environment  = local.env
    secrets      = [{ name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url.arn }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.atrium.name
        awslogs-region        = var.region
        awslogs-stream-prefix = "atrium"
      }
    }
  }])
}

resource "aws_ecs_service" "atrium" {
  name            = var.name
  cluster         = aws_ecs_cluster.atrium.id
  task_definition = aws_ecs_task_definition.atrium.arn
  launch_type     = "FARGATE"
  # One task: live updates and the in-memory model cache assume a single server.
  desired_count = 1
  network_configuration {
    subnets          = data.aws_subnets.default.ids
    security_groups  = [aws_security_group.app.id]
    assign_public_ip = true
  }
  load_balancer {
    target_group_arn = aws_lb_target_group.atrium.arn
    container_name   = "atrium"
    container_port   = 7300
  }
  depends_on = [aws_lb_listener.https]
}
