package za.gov.dsac.vuka.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import za.gov.dsac.vuka.domain.*;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Repository
public interface CommentRepository extends JpaRepository<Comment, UUID> {

    List<Comment> findByEntityIdOrderByCreatedAtDesc(UUID entityId);

    List<Comment> findByEntityIdAndAnchorIdOrderByCreatedAtAsc(UUID entityId, UUID anchorId);

    /** One thread, oldest first, which is reading order. */
    List<Comment> findByEntityIdAndAnchorTypeAndAnchorIdOrderByCreatedAtAsc(
            UUID entityId, Enums.AnchorType anchorType, UUID anchorId);

    /** Every comment in one workspace, oldest first, for the view that groups them by anchor. */
    List<Comment> findByEntityIdOrderByCreatedAtAsc(UUID entityId);

    // ---------- the poll digest ----------
    //
    // Two aggregates rather than the rows. A client polling every five seconds spends one index
    // scan on each of these and goes home with a 304, and the thread itself is only read when
    // the pair has actually moved. Comments are append-only, so the pair cannot repeat a value
    // it has already had: a count can only rise, and resolving bumps the maximum. That is what
    // makes it safe to use as a validator rather than merely as a hint.

    long countByEntityId(UUID entityId);

    /**
     * Threads still open in one workspace: comments that started a thread and have not been
     * closed. This is the number on the reporter's home screen, so it is a count rather than a
     * load of every comment to work the same thing out in Java.
     */
    long countByEntityIdAndParentIdIsNullAndResolvedFalse(UUID entityId);

    @Query("select max(c.updatedAt) from Comment c where c.entity.id = :entityId")
    Instant lastChangeForEntity(@Param("entityId") UUID entityId);

    long countByEntityIdAndAnchorTypeAndAnchorId(UUID entityId, Enums.AnchorType anchorType, UUID anchorId);

    @Query("""
           select max(c.updatedAt) from Comment c
            where c.entity.id = :entityId
              and c.anchorType = :anchorType
              and c.anchorId = :anchorId
           """)
    Instant lastChangeForAnchor(@Param("entityId") UUID entityId,
                                @Param("anchorType") Enums.AnchorType anchorType,
                                @Param("anchorId") UUID anchorId);
}
