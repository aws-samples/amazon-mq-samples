import jakarta.jms.*;
import org.apache.activemq.ActiveMQConnectionFactory;

public class TransactionsTest {
    public static void main(String[] args) {
        if(args.length < 4){
            System.out.println("Provide arguments in required format");
            System.exit(1);
        }
        String userName = args[0];
        String password = args[0];
        String brokerURL = args[2];
        String failTransaction = args[3];
        if(userName == null || password == null || brokerURL == null || failTransaction == null){
            System.out.println("Provide arguments in required format");
            System.exit(1);
        }
        ActiveMQConnectionFactory connectionFactory = new ActiveMQConnectionFactory(brokerURL);
        try(JMSContext jmsContext = connectionFactory.createContext(userName, password, Session.SESSION_TRANSACTED)){
            JMSProducer producer = jmsContext.createProducer();


            Queue warehouseQueue = jmsContext.createQueue("warehouse-queue");
            Queue shippingQueue = jmsContext.createQueue("shipping-queue");

            //Send message to warehouse queue
            producer.send(warehouseQueue, "PREPARE ORDERID 12345");
            System.out.println("Message sent to Warehouse Queue");

            if(Boolean.valueOf(failTransaction)){
                throw new Exception();
            }

            //Send message to shipping queue
            producer.send(shippingQueue, "SHIP ORDERID 12345");
            System.out.println("Message sent to Shipping Queue");
            jmsContext.commit();

            System.out.println("Both the messages are sent");

        }catch (Exception e){
            e.printStackTrace();
            System.out.println("Some exception occurred");
        }



    }
}
