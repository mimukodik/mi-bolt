package com.example.mi_bolt_backend.catalog;

/** Optional initial catalogue promotion; dates retain their explicit offset. */
public record PromotionDto(Boolean enabled, String text, String startsAt, String endsAt) {
}
