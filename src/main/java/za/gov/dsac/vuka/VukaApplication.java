package za.gov.dsac.vuka;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class VukaApplication {
    public static void main(String[] args) {
        SpringApplication.run(VukaApplication.class, args);
    }
}
