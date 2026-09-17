package za.gov.dsac.vuka.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Binds a Firebase Auth user to a role and, for reporters, to exactly one entity.
 */
@Entity
@Table(name = "user_profile")
public class UserProfile {

    @Id
    @GeneratedValue
    private UUID id;

    /** Firebase uid. */
    @Column(nullable = false, unique = true, length = 128)
    private String uid;

    /** Email. */
    @Column(length = 200)
    private String email;

    /** Display name. */
    @Column(length = 200)
    private String displayName;

    /** Role, mirrored into a Firebase custom claim. */
    @Enumerated(EnumType.STRING)
    private Enums.Role role;

    /** Required for ENTITY_REPORTER. Null for DSAC roles. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "entity_id")
    private PublicEntity entity;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public String getUid() { return uid; }
    public void setUid(String uid) { this.uid = uid; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getDisplayName() { return displayName; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }

    public Enums.Role getRole() { return role; }
    public void setRole(Enums.Role role) { this.role = role; }

    public PublicEntity getEntity() { return entity; }
    public void setEntity(PublicEntity entity) { this.entity = entity; }
}
