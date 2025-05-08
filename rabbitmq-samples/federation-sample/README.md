# Implementing Federation for Amazon MQ RabbitMQ Private Brokers

The code sample in this code repository provides cloudformation templates and steps to implement federation on Amazon MQ for RabbitMQ private Brokers

In this solution, you will use two single nstance brokers to see how to implement federation with private brokers.

# Step 0: Prerequisites

1. Access to an AWS account.
2. An AWS IAM user/Principal with the required permissions to deploy the infrastructure.

We create two new VPC from the stack. Make sure that you have fewer than five VPCs in the selected region.  You increase this limit using [Quotas](https://docs.aws.amazon.com/general/latest/gr/aws_service_limits.html)


## Step 1: Deploy the AWS CloudFormation template for the broker stack

1. Search for CloudFormation under Services and click on Create Stack. Choose With new resources (Standard) from the dropdown.

2. For Prepare template, choose an existing template and then for Specify template, choose Upload a template file and use the [BrokerStackTemplate](https://github.com/aws-samples/amazon-mq-samples/tree/main/rabbitmq-samples/federation-sample/templates/BrokerStackTemplate.yaml) file.

3.	Provide a Stack name BrokerStack.

4.	Update the username and CIDR Blocks provided as parameters to the stack or leave them as defaults. For ease of setup, this template uses EC2 with managed prefix lists for EC2 Instance Connect for five regions: us-east-1, us-west-1, us-west-2, eu-west-1 and ap-south-1. Add prefix lists for other regions in the template to run this cloud formation template in those regions.

5.	Click Next and leave everything else as defaults and then Click Submit.

6.	 The template creates two VPCs along with a private and public subnet on each VPC with internet gateway, security groups and route tables. It also creates two private brokers in each VPC along with an EC2 Instance ( t2.micro) on the downstream VPC.

7.	The broker stack deployment takes 10 -15 minutes. 


## Step 2: Retrieve the IP Address for the private upstream broker

1. Once the above stack creation is complete, navigate to the Outputs tab for the stack and copy the output for PrivateUpstreamBrokerEndpoints. 

2.	Extract only the host name from the “PrivateUpstreamBrokerEndpoints” in the output from above. 

3.	Resolve the hostname using the below commands depending on the Operating System you are using: 

      #Linux or Mac

      `$ dig +short {hostname}`

      #Windows

      `C:\> nslookup {hostname}`


   Keep the IP address for using in later steps. 


## Step 3: Create a support case to get the Amazon MQ Rabbit MQ Downstream Broker NAT IPs

1.	Create a support case with AWS Support to get the NAT IPs associated with the downstream MQ Broker. We will use this IP address to allow the Network Load Balancer to be accessed from particular IPs only.


## Step 4: Deploy the AWS CloudFormation template for NLB Stack

1. Search for CloudFormation under Services and click on Create Stack. Choose With new resources (Standard) from the dropdown.

2. For Prepare template, Choose an existing template. For Template source, choose Upload a template file and use the [NLBTemplate](https://github.com/aws-samples/amazon-mq-samples/tree/main/rabbitmq-samples/federation-sample/templates/NLBTemplate.yaml) and click Next.

3.	Under Specify stack details provide a Stack name like NLBStack.

4.	Use the IP Address from Step 2 and Step 3 above in the parameters and Click Next. Make sure that the NAT IP Address is a valid CIDR range like 52.0.0.1/32.

5.	Keep the rest as defaults and Click Next again and then click Submit.

6.	The template creates a Network Load Balancer with 2 target groups and a Security Group for it and also adds rules to the Upstream Default Security group.


## Step 5: Configure Federation in the downstream broker

1.	Use the Upstream Broker NLB URL from the NLBStack and replace it in the below export commands along with the Downstream Broker Uri from the output of the BrokerStack. Replace values for `UpstreamBrokerNLBURL` and `DownstreamBrokerURI`

`export Upstream_Broker_NLB= <UpstreamBrokerNLBURL>`

`export Downstream_Broker_Uri= <DownstreamBrokerURI>`

2.	From the AWS Console, search for AWS Secrets Manager and click on Secrets. You will see 2 secrets with names as DownstreamBrokerUsernamePassword and UpstreamBrokerUsernamePassword. Click on one of them and click Retrieve Secret value to get the passwords and usernames for the brokers. Repeat for the other one. Next, replace values for `Upstream_Broker_Username`, `Upstream_Broker_Password`, `Downstream_Broker_Username` and `Downstream_Broker_Password` in the below.

This is used to create federation on the private upstream broker

`curl -XPUT -d'{"value":{"uri":"amqps://Upstream_Broker_Username:Upstream_Broker_Password@'"$Upstream_Broker_NLB"':5671","expires":3600000}}' https://Downstream_Broker_Username:Downstream_Broker_Password@{$Downstream_Broker_Uri}/api/parameters/federation-upstream/%2f/my-upstream`

This creates policy for federation on the private downstream broker with pattern for exchange with Test in its name

`curl -XPUT -d'{"pattern":"^Test", "definition":{"federation-upstream-set":"all"},"apply-to":"exchanges"}' https://Downstream_Broker_Username:Downstream_Broker_Password@{$Downstream_Broker_Uri}/api/policies/%2f/federate-me`

3.	From the AWS Console, search for EC2 and select the EC2 instance created as part of the Broker Stack in Step 1. Click on Connect with the EC2 Instance selected and Login to the EC2 created as part of the BrokerStack in Step 1 and login using EC2 Instance Connect and choose Connection Type as Connect using EC2 Instance Connect and click Connect. Once connected to the terminal, paste the above lines with replaced values to create the federation upstream and the policy associated with it.


## Step 6: Create TestExchange and Test Queue and Bind them

1.	Run the below steps to create a test exchange and a queue and the binding for them. Replace values for `Downstream_Broker_Username` and `Downstream_Broker_Password`


##creates a test exchange on the private downstream broker

`curl -H "content-type:application/json" -XPUT -d'{"type":"fanout","durable":true}' https://Downstream_Broker_Username:Downstream_Broker_Password@{$Downstream_Broker_Uri}/api/exchanges/%2f/TestExchange`

##creates a test queue on the private downstream broker

`curl -H "content-type:application/json" -XPUT -d'{"durable":true,"arguments":{"x-dead-letter-exchange":"", "x-dead-letter-routing-key": "my.queue.dead-letter"}}' https://Downstream_Broker_Username:Downstream_Broker_Password@{$Downstream_Broker_Uri}/api/queues/%2f/TestQueue`

##Binds the queue to the exchange on the private downstream broker

`curl -H "content-type:application/json" -XPOST -d'{"routing_key":"","arguments":{}}' https://Downstream_Broker_Username:Downstream_Broker_Password@{$Downstream_Broker_Uri}/api/bindings/%2f/e/TestExchange/q/TestQueue`

## Step 7: Validate Federation Status and Test Federation between brokers

1.	Check the Federation status by running the below command while still connected to the EC2 in the same session. Replace values for `Downstream_Broker_Username` and `Downstream_Broker_Password`

##check federation status on the private downstream broker and format it as JSON

`curl -XGET https://Downstream_Broker_Username:Downstream_Broker_Password@{$Downstream_Broker_Uri}/api/federation-links | python3 -m json.tool`

2.	The output will look like the below with status as running.

```
[
    {
        "node": "rabbit@localhost",
        "exchange": "TestExchange",
        "upstream_exchange": "TestExchange",
        "type": "exchange",
        "vhost": "/",
        "upstream": "my-upstream",
        "id": "5cd2293f",
        "status": "running",
        "local_connection": "<rabbit@localhost.1746117897.30989.0>",
        "uri": "amqps://MyUpstreamNLB-XXXXXXXX.elb.us-east-1.amazonaws.com:5671",
…
    }
]
```


3.	Send a test message now. This step is optional and is only for testing and validating. Since you restricted the Upstream Broker NLB to only receive traffic from the Downstream broker (via the IP Address received from the support case), you will need to manually allow the EC2 Public IP Address in the NLB Security Group that was created for port 443 to perform the below step. You will also need to allow the egress from EC2 to access the NLB.

##Send test message on the upstream broker

`curl -k -H "content-type:application/json" -XPOST -d'{"properties":{},"routing_key":"MYKEY","payload":"Hello World","payload_encoding":"string"}' https://Upstream_Broker_Username:Upstream_Broker_Password@{$Upstream_Broker_NLB}/api/exchanges/%2f/TestExchange/publish`


4.	Once the message is sent it will show up as routed: true. This means that the message routed to the downstream broker successfully. 

5.	Use the below to validate the message on the downstream broker. This should provide show you the payload that you sent earlier.

## Get message from queue on the downstream broker
`curl -H "content-type:application/json" -XPOST -d'{"ackmode":"ack_requeue_true","count":1,"encoding": "auto"}' https://Downstream_Broker_Username:Downstream_Broker_Password@{$Downstream_Broker_Uri}/api/queues/%2f/TestQueue/get`

Output
```

[
    {
        "payload_bytes": 11,
        "redelivered": true,
        "exchange": "TestExchange",
        "routing_key": "MYKEY",
        "message_count": 0,
         …
        "payload": "Hello World",
        "payload_encoding": "string"
    }
]
```


## Clean Up

1.	Delete Stack NLBStack created as part of Step 4. For instructions, refer to Deleting a stack on the AWS CloudFormation console.

2.	Delete the BrokerStack created in Step 1.


## Code of Conduct

This project has adopted the [Amazon Open Source Code of Conduct](https://aws.github.io/code-of-conduct).
For more information see the [Code of Conduct FAQ](https://aws.github.io/code-of-conduct-faq) or contact
opensource-codeofconduct@amazon.com with any additional questions or comments.

## Security issue notifications

If you discover a potential security issue in this project we ask that you notify AWS/Amazon Security via
our [vulnerability reporting page](http://aws.amazon.com/security/vulnerability-reporting/). Please do **not** create a
public github issue.
