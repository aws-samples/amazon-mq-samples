package org.aws.samples.amazonmq.activemq.transactions.jms20;

import jakarta.jms.*;
import org.apache.activemq.ActiveMQConnectionFactory;

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
        try{
            JMSProducer producer = jmsContext.createProducer();
            Queue warehouseQueue = jmsContext.createQueue(firstQueueName);
            Queue shippingQueue = jmsContext.createQueue(secondQueueName);

            //Send message to warehouse queue
            producer.send(warehouseQueue, "PREPARE ORDERID " + orderId);
            System.out.println("Order ID "+ orderId +" sent to the warehouse queue");

            if(!Boolean.parseBoolean(isSuccessfulTransaction)){
                throw new Exception();
            }

            //Send message to shipping queue
            producer.send(shippingQueue, "SHIP ORDERID " + orderId);
            System.out.println("Order ID "+ orderId +" sent to the shipping queue");
            jmsContext.commit();
            System.out.println("Order ID " + orderId + " is now complete");
        }catch (Exception e){
            jmsContext.rollback();
            System.out.println("Order ID " + orderId + " cannot be completed hence the transaction is rolled back");
        }finally {
            jmsContext.close();
        }
    }

    private static boolean isNullOrEmpty(String str) {
        return str == null || str.trim().isEmpty();
    }
}
