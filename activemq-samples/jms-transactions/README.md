# AmazonMQ ActiveMQ JMS Transaction Sample Client

The code sample in this code repository provides sample JMS clients to demonstrated transactional capabilities
of [Java Messaging Services(JMS) 2.0 transactions API](https://activemq.apache.org/components/classic/documentation/jms2)
with [AmazonMQ for ActiveMQ](https://aws.amazon.com/amazon-mq/).

The sample producer client sends two messages in a transaction. First message is sent to the first queue and second
message is sent to the second queue.

- In a successful transaction both the messages are delivered to the respective queues
- Both the messages are successfully delivered if the transaction is successful.
- None of the messages are sent to the broker if there is any error during the transaction.

See this FAQ
on [How Do Transactions Work with Active MQ](https://activemq.apache.org/components/classic/documentation/how-do-transactions-work).
 

# Step 0: Prerequisites

To run the samples you will need to create the AmazonMQ ActiveMQ broker 5.18.4 or higher

1. ActiveMQ 5.18+ require Java 11 or above. [Install it using instructions here](https://www.java.com/en/download/help/download_options.html).
2. Apache Maven is required to build the project. Install it from https://maven.apache.org/
3. Install and configure AWS Command Line Interface(CLI) using
   instructions [here](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html#getting-started-install-instructions)
4. Ensure that you have an IAM Principal(user/role)
   with [AmazonMQFullAccess](https://docs.aws.amazon.com/aws-managed-policy/latest/reference/AmazonMQFullAccess.html) policy attached.

## Step 1: Create the AmazonMQ ActiveMQ Broker

1. To create the broker using command line. Run the following command
   ```
   aws mq create-broker \
    --broker-name test-broker-create-using-cli \
    --engine-type activemq \
    --engine-version <ENGINE_VERSION> \
    --deployment-mode SINGLE_INSTANCE \
    --host-instance-type mq.m5.large \
    --auto-minor-version-upgrade \
    --publicly-accessible \
    --users Username=<USERNAME>,Password=<PASSWORD>,ConsoleAccess=true
   ```
    - In the above command replace the value of `<ENGINE_VERSION>` with the version of your choice. For JMS 
      transactions you will need engine version `5.18.x` and above.
    - Replace `<USERNAME>` and `<PASSWORD>` with actual values for username and password of the user you would 
      create. 
    - Refer to [Active MQ CLI documentation](https://awscli.amazonaws.com/v2/documentation/api/latest/reference/mq/create-broker.html) for more details 

2. After the successful invocation of the above command will return with the value of `BrokerArn` and `BrokerId`. Note down
   these values as they will be needed for running the sample code.
3. Get the console URL by running the following command
   ```aws mq describe-broker --broker-id <BROKER-ID> --query 'BrokerInstances[0]’```
   Replace `<BROKER-ID>` with the value you noted down in the previous step. Note down the console URL value

4. Get your local machine's IP address - To publish the messages to the broker you have to add your local machine's IP address in the inbound rules of
   the security group for ActiveMQ broker. Follow these steps to achieve that.
    1. Find your public IP. You can do by going to https://whatismyipaddress.com/ and note down IPV4 address.
   
    2. Find the security group id of your broker by running the following
       command `aws mq describe-broker --broker-id <Broker-ID> --query 'SecurityGroups[0]'`.
       Replace `<BROKER-ID>` with the value you noted down in the earlier steps. Note down the value of the Security Group ID.
   
    3. To access the admin console via web browser, add a new inbound rule to the ActiveMQ security group by running the following
       command. 
       `aws ec2 authorize-security-group-ingress --group-id <SECURITY_GROUP_ID> --protocol tcp --port 8162 --cidr <YOUR_PUBLIC_IP>/32`.
       Replace <SECURITY_GROUP_ID> and <YOUR_PUBLIC_IP> with the values noted down above.
   
    4. To be able to send messages to the broker via command line, add another inbound rule to the ActiveMQ security group by running the following. 
       Replace <SECURITY_GROUP_ID> and <YOUR_PUBLIC_IP> with the values you copied above
       ```aws ec2 authorize-security-group-ingress --group-id <SECURITY_GROUP_ID> --protocol tcp --port 61617 --cidr <YOUR_PUBLIC_IP>/32```

## Step 2: Run the sample code

1. Clone the project in a local directory

   ```git clone git@github.com:aws-samples/amazon-mq-samples.git```

2. Go to the JMS Transactions Samples directory

   ```cd amazon-mq-samples/activemq-samples/jms-transactions```

3. Create the jar file

   ```mvn clean package```

   This will create a new jar file with name starting with `amazonmq-samples-` under the `target/` directory

4. We are ready to test transactional capabilities for our sample. To test, you can test the transactions by sending messages to the broker using the following command
   `java -jar target/amazonmq-samples-1.0.jar <USERNAME> <PASSWORD> <BROKER-URL> <first-queue-name> <second-queue-name> <message> <is-transaction-successful>`
   
   Where
   - `target/amazonmq-samples-1.0.jar` is the path to the jar you created in earlier step.
   - `<USERNAME>` is the username for the user you created above.
   - `<PASSWORD>` is the password for the user you created above.
   - `<BROKER-URL>` is the URL for the broker. In Amazon MQ for Active MQ this will be in the format <TODO>.
   - `<first-queue-name>` is the name of the first queue in your transaction.
   - `<second-queue-name>` is the name of the second queue in your transaction.
   - `<message>` your message text. This is the message you are sending to the queues.
   - `<is-transaction-successful>` This tells the sample code whether to succeed the transaction or mimic a failure. Possible values true or false.

   In our testing we will send two messages related to an order-id. The first message is sent to the `warehouse-queue` and the second message is sent to the `shipping-queue`. 
   If a transaction is successful both the messages are delivered to the respective queues. If a transaction fails none of the messages are delivered.


## Clean Up
Delete the broker by running the following command `aws mq delete-broker --broker-id <BROKER-ID>`. 

Replace `<BROKER-ID>` with the value you noted down in the previous step.

## Code of Conduct

This project has adopted the [Amazon Open Source Code of Conduct](https://aws.github.io/code-of-conduct).
For more information see the [Code of Conduct FAQ](https://aws.github.io/code-of-conduct-faq) or contact
opensource-codeofconduct@amazon.com with any additional questions or comments.

## Security issue notifications

If you discover a potential security issue in this project we ask that you notify AWS/Amazon Security via
our [vulnerability reporting page](http://aws.amazon.com/security/vulnerability-reporting/). Please do **not** create a
public github issue.
