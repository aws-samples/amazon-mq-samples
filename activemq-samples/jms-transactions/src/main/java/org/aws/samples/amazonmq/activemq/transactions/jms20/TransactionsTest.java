package org.aws.samples.amazonmq.activemq.transactions.jms20;

import jakarta.jms.*;
import org.apache.activemq.ActiveMQConnectionFactory;

public class TransactionsTest {
    public static void main(String[] args) {
        if(args.length < 5 ){
            System.out.println("Provide all the arguments in the required format");
            System.out.println("java -jar <jar-file> <brokerUsername> <brokerPassword> <brokerURL> <orderId> <successfulTransaction>");
            System.exit(1);
        }

        String userName = args[0];
        String password = args[1];
        String brokerURL = args[2];
        String orderId = args[3];
        String successfulTransaction = args[4];

        if(isNullOrEmpty(userName) || isNullOrEmpty(password) ||
                isNullOrEmpty(brokerURL) ||
                isNullOrEmpty(orderId)  || isNullOrEmpty(successfulTransaction) ){
            System.out.println("Provide valid arguments in required format");
            System.out.println("java -jar <jar-file> <brokerUsername> <brokerPassword> <brokerURL> <orderId> <successfulTransaction>");
            System.exit(1);
        }

        ActiveMQConnectionFactory connectionFactory = new ActiveMQConnectionFactory(brokerURL);
        JMSContext jmsContext = connectionFactory.createContext(userName, password, Session.SESSION_TRANSACTED);
        try{
            JMSProducer producer = jmsContext.createProducer();
            Queue warehouseQueue = jmsContext.createQueue("warehouse-queue");
            Queue shippingQueue = jmsContext.createQueue("shipping-queue");

            //Send message to warehouse queue
            producer.send(warehouseQueue, "PREPARE ORDERID " + orderId);
            System.out.println("Order ID "+ orderId +" sent to the warehouse queue");

            if(!Boolean.valueOf(successfulTransaction)){
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
