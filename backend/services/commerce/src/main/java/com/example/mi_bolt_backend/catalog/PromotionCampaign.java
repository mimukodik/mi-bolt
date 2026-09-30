package com.example.mi_bolt_backend.catalog;

import java.time.OffsetDateTime;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

/** The one shared campaign; its singleton row is created by the migration. */
@Entity
@Table(name = "promotion_campaign")
public class PromotionCampaign {

	@Id
	private Integer id;
	@Version
	private long version;
	@Column(length = 300)
	private String text;
	@Column(name = "starts_at")
	private OffsetDateTime startsAt;
	@Column(name = "ends_at")
	private OffsetDateTime endsAt;

	public long getVersion() { return version; }
	public String getText() { return text; }
	public OffsetDateTime getStartsAt() { return startsAt; }
	public OffsetDateTime getEndsAt() { return endsAt; }
	public void configure(String text, OffsetDateTime startsAt, OffsetDateTime endsAt) {
		this.text = text;
		this.startsAt = startsAt;
		this.endsAt = endsAt;
	}
}
