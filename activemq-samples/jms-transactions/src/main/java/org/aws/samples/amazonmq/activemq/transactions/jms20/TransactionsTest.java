package org.aws.samples.amazonmq.activemq.transactions.jms20;

import jakarta.jms.*;
import org.apache.activemq.ActiveMQConnectionFactory;

import java.util.Enumeration;

public class TransactionsTest {
    public static void main(String[] args) {
        String commandInstructions = "Provide all the arguments in the required format";
        commandInstructions += "\njava -jar <jar-file> <adminUsername> <adminPassword> <brokerSSLEndpoint> <firstQueueName> <secondQueueName> <message> <isSuccessfulTransaction>";
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
        String message = args[5];
        String isSuccessfulTransaction = args[6];

        if(isNullOrEmpty(adminUsername) || isNullOrEmpty(adminPassword) ||
                isNullOrEmpty(brokerSSLEndpoint) ||
                isNullOrEmpty(firstQueueName) ||
                isNullOrEmpty(secondQueueName) ||
                isNullOrEmpty(message)  || isNullOrEmpty(isSuccessfulTransaction) ){
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
            System.out.println("------");
            System.out.println("Number of messages in " + firstQueueName + " : " + getNumberOfMessagesInQueue(firstQueueBrowser));
            System.out.println("Number of messages in " + secondQueueName + " : " + getNumberOfMessagesInQueue(secondQueueBrowser));
            System.out.println("------");
            //Send message to the first queue
            System.out.println("Sending message: " + message + " to the " + firstQueueName);
            producer.send(firstQueue, message);
            System.out.println("Message: "+ message +" is sent to the queue: " + firstQueueName + " but not yet committed.");
            System.out.println("Number of messages in " + firstQueueName + " : " + getNumberOfMessagesInQueue(firstQueueBrowser));
            System.out.println("Number of messages in " + secondQueueName + " : " + getNumberOfMessagesInQueue(secondQueueBrowser));
            System.out.println("------");
            //If transaction fails then just throw the exception
            if(!Boolean.parseBoolean(isSuccessfulTransaction)){
                throw new Exception();
            }

            //Send message to the second queue
            System.out.println("Sending message: " + message + " to the " + secondQueueName);
            producer.send(secondQueue, message);
            System.out.println("Message: "+ message +" is sent to the queue: " + secondQueueName + " but not yet committed.");
            System.out.println("Number of messages in " + firstQueueName + " : " + getNumberOfMessagesInQueue(firstQueueBrowser));
            System.out.println("Number of messages in " + secondQueueName + " : " + getNumberOfMessagesInQueue(secondQueueBrowser));
            System.out.println("------");
            System.out.println("Committing");
            //Only when both the messages are successful commit the transaction
            jmsContext.commit();

            System.out.println("Transaction for Message: " + message + " is now completely committed.");
            System.out.println("Number of messages in " + firstQueueName + " : " + getNumberOfMessagesInQueue(firstQueueBrowser));
            System.out.println("Number of messages in " + secondQueueName + " : " + getNumberOfMessagesInQueue(secondQueueBrowser));
        }catch (Exception e){
            jmsContext.rollback();
            System.out.println("Message: " + message + " cannot be delivered because of an unknown error. Hence the transaction is rolled back.");
            System.out.println("Number of messages in " + firstQueueName + " : " + getNumberOfMessagesInQueue(firstQueueBrowser));
            System.out.println("Number of messages in " + secondQueueName + " : " + getNumberOfMessagesInQueue(secondQueueBrowser));
        }finally {
            jmsContext.close();
        }
    }

    private static int getNumberOfMessagesInQueue(QueueBrowser queueBrowser) {
        int count = 0;
        try {
            Enumeration enumeration = queueBrowser.getEnumeration();
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
