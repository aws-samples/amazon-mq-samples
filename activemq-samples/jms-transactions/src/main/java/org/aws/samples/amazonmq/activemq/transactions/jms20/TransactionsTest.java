package org.aws.samples.amazonmq.activemq.transactions.jms20;

import jakarta.jms.*;
import org.apache.activemq.ActiveMQConnectionFactory;

public class TransactionsTest {
    public static void main(String[] args) {
        if(args.length < 5 ){
            System.out.println("Provide all the arguments in the required format");
            System.out.println("java -jar <jar-file> brokerUsername brokerPassword brokerURL failTransaction orderId");
            System.exit(1);
        }

        String userName = args[0];
        String password = args[1];
        String brokerURL = args[2];
        String failTransaction = args[3];
        String orderId = args[4];

        if(isNullOrEmpty(userName) || isNullOrEmpty(password) ||
                isNullOrEmpty(brokerURL) || isNullOrEmpty(failTransaction) ||
                isNullOrEmpty(orderId)){
            System.out.println("Provide valid arguments in required format");
            System.out.println("java -jar <jar-file> brokerUsername brokerPassword brokerURL failTransaction orderId");
            System.exit(1);
        }

        ActiveMQConnectionFactory connectionFactory = new ActiveMQConnectionFactory(brokerURL);
        try(JMSContext jmsContext = connectionFactory.createContext(userName, password, Session.SESSION_TRANSACTED)){
            JMSProducer producer = jmsContext.createProducer();
            Queue warehouseQueue = jmsContext.createQueue("warehouse-queue");
            Queue shippingQueue = jmsContext.createQueue("shipping-queue");

            //Send message to warehouse queue
            producer.send(warehouseQueue, "PREPARE ORDERID " + orderId);
            System.out.println("Message sent to Warehouse Queue");

            if(Boolean.valueOf(failTransaction)){
                throw new Exception();
            }

            //Send message to shipping queue
            producer.send(shippingQueue, "SHIP ORDERID " + orderId);
            System.out.println("Message sent to Shipping Queue");
            jmsContext.commit();
            System.out.println("Both the messages are sent");
        }catch (Exception e){
            e.printStackTrace();
        }
    }

    private static boolean isNullOrEmpty(String str) {
        return str == null || str.trim().isEmpty();
    }
}
