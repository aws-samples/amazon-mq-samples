resource "aws_vpc" "mq_vpc" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name        = "mq-vpc"
    Environment = var.environment
  }
}

resource "aws_subnet" "mq_subnet" {
  vpc_id            = aws_vpc.mq_vpc.id
  cidr_block        = "10.0.1.0/24"
  availability_zone = "${var.aws_region}a"

  tags = {
    Name        = "mq-subnet"
    Environment = var.environment
  }
}

resource "aws_security_group" "mq_security_group" {
  name_prefix = "mq-security-group"
  vpc_id      = aws_vpc.mq_vpc.id

  ingress {
    from_port   = 61617
    to_port     = 61617
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"]
    description = "OpenWire protocol"
  }

  ingress {
    from_port   = 8162
    to_port     = 8162
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"]
    description = "Web Console"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "mq-security-group"
    Environment = var.environment
  }
}