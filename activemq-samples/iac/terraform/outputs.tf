output "broker_id" {
  description = "The ID of the MQ broker"
  value       = aws_mq_broker.activemq_broker.id
}

output "broker_arn" {
  description = "The ARN of the MQ broker"
  value       = aws_mq_broker.activemq_broker.arn
}

output "broker_instances" {
  description = "List of broker instances"
  value       = aws_mq_broker.activemq_broker.instances
}

output "primary_console_url" {
  description = "The URL of the primary web console"
  value       = aws_mq_broker.activemq_broker.instances[0].console_url
}