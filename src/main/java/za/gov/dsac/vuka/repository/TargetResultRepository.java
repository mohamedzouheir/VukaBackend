package za.gov.dsac.vuka.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import za.gov.dsac.vuka.domain.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface TargetResultRepository extends JpaRepository<TargetResult, UUID> {

    List<TargetResult> findBySubmissionId(UUID submissionId);
    List<TargetResult> findByTargetId(UUID targetId);

    /**
     * The confirmations for one target inside one submission, most recent first.
     *
     * Confirmed results are append-only, so a reporter who goes back a step and answers again
     * leaves both rows on the record. That is the intended behaviour and it is what the audit
     * trail is for. It does mean a reader has to say which one it wants, and "most recent within
     * this submission" is the only answer that is both well defined and what the reporter expects
     * to see when they reopen a step.
     */
    List<TargetResult> findBySubmissionIdAndTargetIdOrderByConfirmedAtDesc(UUID submissionId, UUID targetId);
}
