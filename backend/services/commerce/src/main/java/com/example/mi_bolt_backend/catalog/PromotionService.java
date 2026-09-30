package com.example.mi_bolt_backend.catalog;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import com.example.mi_bolt_backend.api.model.AdminPromotion;
import com.example.mi_bolt_backend.api.model.AdminPromotionInput;
import com.example.mi_bolt_backend.api.model.FieldError;
import com.example.mi_bolt_backend.api.model.Promotion;
import com.example.mi_bolt_backend.problem.DomainException;
import com.example.mi_bolt_backend.problem.ErrorCode;

@Service
@Transactional(readOnly = true)
public class PromotionService {
	private final PromotionCampaignRepository campaigns;
	private final Clock clock;
	public PromotionService(PromotionCampaignRepository campaigns, Clock clock) {
		this.campaigns = campaigns;
		this.clock = clock;
	}
	public Promotion get() {
		PromotionCampaign campaign = campaigns.findById(1).orElseThrow();
		OffsetDateTime now = OffsetDateTime.now(clock);
		return new Promotion(active(campaign, now), now).text(campaign.getText())
				.startsAt(campaign.getStartsAt()).endsAt(campaign.getEndsAt());
	}
	public AdminPromotion admin() {
		PromotionCampaign campaign = campaigns.findById(1).orElseThrow();
		OffsetDateTime now = OffsetDateTime.now(clock);
		return new AdminPromotion(active(campaign, now), now, campaign.getVersion())
				.text(campaign.getText()).startsAt(campaign.getStartsAt()).endsAt(campaign.getEndsAt());
	}
	@Transactional
	public AdminPromotion replace(String ifMatch, AdminPromotionInput input) {
		PromotionCampaign campaign = campaigns.findById(1).orElseThrow();
		if (ifMatch == null || ifMatch.isBlank()) {
			throw new DomainException(ErrorCode.PRECONDITION_REQUIRED, "If-Match is required");
		}
		if (!ifMatch.equals("\"" + campaign.getVersion() + "\"") && !ifMatch.equals(Long.toString(campaign.getVersion()))) {
			throw new DomainException(ErrorCode.PRODUCT_VERSION_CONFLICT, "Campaign version conflict",
					Map.of("expected", campaign.getVersion(), "received", ifMatch));
		}
		List<FieldError> errors = new ArrayList<>();
		boolean configured = input.getText() != null || input.getStartsAt() != null || input.getEndsAt() != null;
		if (configured) {
			if (input.getText() == null || input.getText().isBlank()) { errors.add(new FieldError("/text", "NOTBLANK")); }
			if (input.getStartsAt() == null) { errors.add(new FieldError("/startsAt", "PROMOTION_INCOMPLETE")); }
			if (input.getEndsAt() == null) { errors.add(new FieldError("/endsAt", "PROMOTION_INCOMPLETE")); }
			if (input.getStartsAt() != null && input.getEndsAt() != null && !input.getStartsAt().isBefore(input.getEndsAt())) {
				errors.add(new FieldError("/endsAt", "PROMOTION_INTERVAL"));
			}
		}
		if (!errors.isEmpty()) {
			throw new DomainException(ErrorCode.VALIDATION_FAILED, "Campaign fields are not acceptable", null, errors, null);
		}
		campaign.configure(input.getText() == null ? null : input.getText().strip(), input.getStartsAt(), input.getEndsAt());
		try { campaigns.saveAndFlush(campaign); }
		catch (ObjectOptimisticLockingFailureException ex) {
			throw new DomainException(ErrorCode.PRODUCT_VERSION_CONFLICT, "Campaign version conflict", null, null, ex);
		}
		return admin();
	}
	private static boolean active(PromotionCampaign campaign, OffsetDateTime now) {
		return campaign.getStartsAt() != null && campaign.getEndsAt() != null
				&& !now.isBefore(campaign.getStartsAt()) && now.isBefore(campaign.getEndsAt());
	}
}
