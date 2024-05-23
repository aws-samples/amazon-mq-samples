# AmazonMQ ActiveMQ JMS Transaction Sample Client

This code repository provides sample JMS client for using [Java Messaging Services(JMS) transactions API](https://activemq.apache.org/components/classic/documentation/how-do-transactions-work) with [AmazonMQ for ActiveMQ](https://aws.amazon.com/amazon-mq/).
A valid transaction involves sending two messages one each for a different queue 
- Both the messages are successfully delivered if the transaction is successful.
- None of the messages are sent to the broker if there is any error during the transaction.

# Prerequisites
To run the samples you will need to create the AmazonMQ ActiveMQ broker 5.18.4 or higher
1. Java 11 or above. ActiveMQ 5.18+ require Java 11 or above. 
2. Apache Maven is required to build project. Install it from https://maven.apache.org/ 
3. Install and configure AWS Command Line Interface(CLI) using instructions [here](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
4. If you don't have the AmazonMQ for ActiveMQ broker then create as per the instructions below

## Creating the AmazonMQ ActiveMQ Broker

1. Create a user with [AmazonMQFullAccess](https://docs.aws.amazon.com/aws-managed-policy/latest/reference/AmazonMQFullAccess.html) policy attached to the users
2. To create the broker using command line. Run the following command
```
aws mq create-broker \
 --broker-name test-broker-create-using-cli \
 --engine-type activemq \
 --engine-version 5.18.4 \
 --deployment-mode SINGLE_INSTANCE \
 --host-instance-type mq.m5.large \
 --auto-minor-version-upgrade \
 --publicly-accessible \
 --users Username=<username>,Password=<PASSWORD>,ConsoleAccess=true
```
- Replace the value of `--engine-version` with the version of your choice. Code samples in this repo support ActiveMQ 5.18.x and above.
- Replace and `<PASSWORD>` with a secure password value. This is the password you will use to log in to ActivMQ Management Console.
3. Note down the value of `BrokerArn` and `BrokerId`. This will be needed for running the sample
4. Get the console URL by running the following command

```aws mq describe-broker --broker-id <BROKER-ID> --query 'BrokerInstances[0]’```

Replace `<BROKER-ID` with the value you received in the previous step. Copy the response in a text file. This too you will need in subsequent steps
5. Next step is to add security group inbound rule for you to be able to access ActiveMQ management console via browser
   1. Find your public IP. You can do by going to https://whatismyipaddress.com/ and copying your IPV4
   2. Find the security group id of your broker by running the following command ```aws mq describe-broker --broker-id b-ba74038f-fef5-435f-a417-cb79c7d8c680 --query 'SecurityGroups[0]'```. Copy the security group ID
   3. To access the admin console via web browser the inbound rule to the security group by running the following command. Replace <SECURITY_GROUP_ID> and <YOUR_PUBLIC_IP> with the values you copied above
   4. To send messages to the broker via command line add another inbound rule to the security group by running the following command. Replace <SECURITY_GROUP_ID> and <YOUR_PUBLIC_IP> with the values you copied above
   ```aws ec2 authorize-security-group-ingress --group-id <SECURITY_GROUP_ID> --protocol tcp --port 61617 --cidr <YOUR_PUBLIC_IP>/32```

## Running the sample code

1. Clone the project in a local directory

 ```git clone git@github.com:aws-samples/amazon-mq-samples.git```

2. Go to ActiveMQ JMS Samples directory

```cd amazon-mq-samples/activemq-samples/jms-transactions```

3. Create the jar file
```mvn clean package```
You should have a new jar file with name starting with `amazonmq-samples-` under the `target/` directory
4. To test a successful transaction run the following command
```java -jar target/amazonmq-samples-1.0.jar <adminUsername> <adminPassword> < ssl://<broker-id>:61617 warehouse-queue shipping-queue <Order-ID> true```
5. To test unsuccessful transaction run the following command
   ```java -jar target/amazonmq-samples-1.0.jar <adminUsername> <adminPassword> < ssl://<broker-id>:61617 warehouse-queue shipping-queue <Order-ID> false```

## Code of Conduct
This project has adopted the [Amazon Open Source Code of Conduct](https://aws.github.io/code-of-conduct).
For more information see the [Code of Conduct FAQ](https://aws.github.io/code-of-conduct-faq) or contact
opensource-codeofconduct@amazon.com with any additional questions or comments.


## Security issue notifications
If you discover a potential security issue in this project we ask that you notify AWS/Amazon Security via our [vulnerability reporting page](http://aws.amazon.com/security/vulnerability-reporting/). Please do **not** create a public github issue.
