package org.aws.samples.amazonmq.activemq.transactions.jms20;

import jakarta.jms.*;
import org.apache.activemq.ActiveMQConnectionFactory;

import java.util.Enumeration;

public class TransactionsTest {
    public static void main(String[] args) {
        String commandInstructions = "Provide all the arguments in the required format";
        commandInstructions += "\njava -jar <jar-file> <adminUsername> <adminPassword> <brokerSSLEndpoint> <firstQueueName> <secondQueueName> <orderId> <isSuccessfulTransaction>";
        commandInstructions += "\n\nExample of successful transaction: java -jar target/amazonmq-samples-1.0.jar <adminUsername> <adminPassword> < ssl://<broker-id>:61617 warehouse-queue shipping-queue <Order-ID> true";
        commandInstructions += "\n\nExample of failed transaction: java -jar target/amazonmq-samples-1.0.jar <adminUsername> <adminPassword> < ssl://<broker-id>:61617 warehouse-queue shipping-queue <Order-ID> false";
        if(args.length < 7 ){
            System.out.println();
            System.out.println(commandInstructions);
            System.exit(1);
        }

        String adminUsername = args[0];
        String adminPassword = args[1];
        String brokerSSLEndpoint = args[2];
        String firstQueueName = args[3];
        String secondQueueName = args[4];
        String orderId = args[5];
        String isSuccessfulTransaction = args[6];

        if(isNullOrEmpty(adminUsername) || isNullOrEmpty(adminPassword) ||
                isNullOrEmpty(brokerSSLEndpoint) ||
                isNullOrEmpty(firstQueueName) ||
                isNullOrEmpty(secondQueueName) ||
                isNullOrEmpty(orderId)  || isNullOrEmpty(isSuccessfulTransaction) ){
            System.out.println(commandInstructions);
            System.exit(1);
        }

        ActiveMQConnectionFactory connectionFactory = new ActiveMQConnectionFactory(brokerSSLEndpoint);
        JMSContext jmsContext = connectionFactory.createContext(adminUsername, adminPassword, Session.SESSION_TRANSACTED);
        Queue firstQueue = jmsContext.createQueue(firstQueueName);
        Queue secondQueue = jmsContext.createQueue(secondQueueName);
        QueueBrowser firstQueueBrowser = jmsContext.createBrowser(firstQueue);
        QueueBrowser secondQueueBrowser = jmsContext.createBrowser(secondQueue);

        try{
            JMSProducer producer = jmsContext.createProducer();
            System.out.println("Number of messages in " + firstQueueName + " : " + getNumberOfMessagesInQueue(firstQueueBrowser));
            System.out.println("Number of messages in " + secondQueueName + " : " + getNumberOfMessagesInQueue(secondQueueBrowser));
            //Send message to warehouse queue
            producer.send(firstQueue, "PREPARE ORDERID " + orderId);
            System.out.println("Order ID "+ orderId +" sent to the warehouse queue");

            if(!Boolean.parseBoolean(isSuccessfulTransaction)){
                throw new Exception();
            }

            //Send message to shipping queue
            producer.send(secondQueue, "SHIP ORDERID " + orderId);
            System.out.println("Order ID "+ orderId +" sent to the shipping queue");
            jmsContext.commit();
            System.out.println("Order ID " + orderId + " is now complete");
            System.out.println("Number of messages in " + firstQueueName + " : " + getNumberOfMessagesInQueue(firstQueueBrowser));
            System.out.println("Number of messages in " + secondQueueName + " : " + getNumberOfMessagesInQueue(secondQueueBrowser));
        }catch (Exception e){
            jmsContext.rollback();
            System.out.println("Order ID " + orderId + " cannot be completed hence the transaction is rolled back");
            System.out.println("Number of messages in " + firstQueueName + " : " + getNumberOfMessagesInQueue(firstQueueBrowser));
            System.out.println("Number of messages in " + secondQueueName + " : " + getNumberOfMessagesInQueue(secondQueueBrowser));
        }finally {
            jmsContext.close();
        }
    }

    private static int getNumberOfMessagesInQueue(QueueBrowser firstQueueBrowser) {
        int count = 0;
        try {
            Enumeration enumeration = firstQueueBrowser.getEnumeration();
            while (enumeration.hasMoreElements()) {
                count++;
                enumeration.nextElement();
            }
        } catch (Exception e){
            return 0;
        }
        return count;
    }

    private static boolean isNullOrEmpty(String str) {
        return str == null || str.trim().isEmpty();
    }
}
