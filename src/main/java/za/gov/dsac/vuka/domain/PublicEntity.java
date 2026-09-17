package za.gov.dsac.vuka.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * A body funded by DSAC: one of the 26 public entities or six NPOs.
 */
@Entity
@Table(name = "public_entity")
public class PublicEntity {

    @Id
    @GeneratedValue
    private UUID id;

    /** Registered name. */
    @Column(nullable = false, length = 500)
    private String name;

    /** Short label used in tables and charts. */
    @Column(length = 100)
    private String shortName;

    /** Public entity or NPO. */
    @Enumerated(EnumType.STRING)
    private Enums.EntityType entityType;

    /** Sector. Constrains which peers unit cost may be compared against. */
    @Enumerated(EnumType.STRING)
    private Enums.Sector sector;

    /**
     * Where the body sits in the PFMA schedules. Every DSAC entity is 3A except the Pan South
     * African Language Board, which is a Schedule 1 constitutional institution.
     *
     * <p>This decides who the entity reports performance to and under what instrument, so it
     * decides which deadlines are law and which are the department asking. See
     * {@link Enums.PfmaSchedule}.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "pfma_schedule", length = 20)
    private Enums.PfmaSchedule pfmaSchedule;

    /** Rough size, used to scope reporting expectations. */
    @Enumerated(EnumType.STRING)
    private Enums.SizeBand sizeBand;

    /** Legislative or founding mandate. */
    @Column(length = 2000)
    private String mandate;

    /** Primary reporting contact. */
    @Column(length = 200)
    private String contactName;

    /** Contact email. */
    @Column(length = 200)
    private String contactEmail;

    /** Set by DSAC. Gates whether this entity appears in the citizen view at all. */
    @Column(name = "publicly_visible", nullable = false)
    private boolean publiclyVisible;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getShortName() { return shortName; }
    public void setShortName(String shortName) { this.shortName = shortName; }

    public Enums.EntityType getEntityType() { return entityType; }
    public void setEntityType(Enums.EntityType entityType) { this.entityType = entityType; }

    public Enums.Sector getSector() { return sector; }
    public void setSector(Enums.Sector sector) { this.sector = sector; }

    public Enums.PfmaSchedule getPfmaSchedule() { return pfmaSchedule; }
    public void setPfmaSchedule(Enums.PfmaSchedule pfmaSchedule) { this.pfmaSchedule = pfmaSchedule; }

    public Enums.SizeBand getSizeBand() { return sizeBand; }
    public void setSizeBand(Enums.SizeBand sizeBand) { this.sizeBand = sizeBand; }

    public String getMandate() { return mandate; }
    public void setMandate(String mandate) { this.mandate = mandate; }

    public String getContactName() { return contactName; }
    public void setContactName(String contactName) { this.contactName = contactName; }

    public String getContactEmail() { return contactEmail; }
    public void setContactEmail(String contactEmail) { this.contactEmail = contactEmail; }

    public boolean isPubliclyVisible() { return publiclyVisible; }
    public void setPubliclyVisible(boolean publiclyVisible) { this.publiclyVisible = publiclyVisible; }
}
