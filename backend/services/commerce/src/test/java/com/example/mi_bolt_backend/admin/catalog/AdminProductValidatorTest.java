package com.example.mi_bolt_backend.admin.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.example.mi_bolt_backend.api.model.AdminProductColorInput;
import com.example.mi_bolt_backend.api.model.AdminProductInput;
import com.example.mi_bolt_backend.api.model.AdminProductVariantInput;
import com.example.mi_bolt_backend.api.model.AdminSpecGroup;
import com.example.mi_bolt_backend.api.model.AdminSpecRow;
import com.example.mi_bolt_backend.api.model.FieldError;
import com.example.mi_bolt_backend.api.model.Money;
import com.example.mi_bolt_backend.api.model.StorageGb;
import com.example.mi_bolt_backend.api.model.Promotion;

/**
 * Unit tests for {@link AdminProductValidator}, the cross-field rules a single
 * field's Bean Validation constraint cannot express. Every case asserts the
 * exact error list, so path, code and params are all pinned.
 */
class AdminProductValidatorTest {

	private final AdminProductValidator validator = new AdminProductValidator();


	@Test
	void enabledPromotionRequiresTextTimesAndSalePrice() {
		AdminProductInput input = validInput();
		input.setPromotion(new Promotion(true));
		assertThat(validator.validate(input)).containsExactly(
				new FieldError("/promotion/text", "NOTBLANK"),
				new FieldError("/promotion/startsAt", "PROMOTION_TIME_REQUIRED"),
				new FieldError("/promotion/endsAt", "PROMOTION_TIME_REQUIRED"),
				new FieldError("/variants", "PROMOTION_SALE_PRICE_REQUIRED"));
	}

	@Test
	void promotionUsesStrictInstantOrderAndPositiveWholeForints() {
		AdminProductInput input = validInput();
		OffsetDateTime start = OffsetDateTime.parse("2026-10-10T12:00:00Z");
		input.setPromotion(new Promotion(true).text("Offer").startsAt(start).endsAt(start.plusSeconds(1)));
		input.getVariants().get(0).setSalePriceHuf(1);
		assertThat(validator.validate(input)).isEmpty();
		input.getPromotion().setEndsAt(start.withOffsetSameInstant(ZoneOffset.ofHours(2)));
		assertThat(validator.validate(input)).containsExactly(new FieldError("/promotion/endsAt", "PROMOTION_TIME_RANGE"));
		input.getPromotion().setEndsAt(start.minusSeconds(1));
		assertThat(validator.validate(input)).containsExactly(new FieldError("/promotion/endsAt", "PROMOTION_TIME_RANGE"));
		input.setPromotion(new Promotion(false));
		input.getVariants().get(0).setSalePriceHuf(0);
		assertThat(validator.validate(input)).containsExactly(new FieldError("/variants/0/salePriceHuf", "MIN"));
		input.getVariants().get(0).setSalePriceHuf(-1);
		assertThat(validator.validate(input)).containsExactly(new FieldError("/variants/0/salePriceHuf", "MIN"));
	}

	@Test
	void salePriceAndClearFlagCannotBeCombined() {
		AdminProductInput input = validInput();
		input.getVariants().get(0).setSalePriceHuf(1);
		input.getVariants().get(0).setClearSalePrice(true);
		assertThat(validator.validate(input)).containsExactly(new FieldError("/variants/0/clearSalePrice", "SALE_PRICE_CONFLICT"));
	}

	@Test
	void validInputProducesNoErrors() {
		assertThat(validator.validate(validInput())).isEmpty();
	}

	@Test
	void blankBrandIsReported() {
		AdminProductInput input = validInput();
		input.setBrand("  ");

		assertThat(validator.validate(input))
				.containsExactly(new FieldError("/brand", "NOTBLANK"));
	}

	@Test
	void blankNameIsReported() {
		AdminProductInput input = validInput();
		input.setName("  ");

		assertThat(validator.validate(input))
				.containsExactly(new FieldError("/name", "NOTBLANK"));
	}

	@Test
	void blankHighlightAtSecondPositionIsReported() {
		AdminProductInput input = validInput();
		input.getHighlights().set(1, "  ");

		assertThat(validator.validate(input))
				.containsExactly(new FieldError("/highlights/1", "NOTBLANK"));
	}

	@Test
	void duplicateColorCodeAtSecondPositionIsReported() {
		AdminProductInput input = validInput();
		input.getColors().get(1).setCode("black");
		input.getVariants().get(1).setColorCode("black");

		assertThat(validator.validate(input))
				.containsExactly(new FieldError("/colors/1/code", "DUPLICATE_COLOR_CODE"));
	}

	@Test
	void blankColorNameIsReported() {
		AdminProductInput input = validInput();
		input.getColors().get(0).setName("  ");

		assertThat(validator.validate(input))
				.containsExactly(new FieldError("/colors/0/name", "NOTBLANK"));
	}

	@Test
	void blankColorAltIsReported() {
		AdminProductInput input = validInput();
		input.getColors().get(0).setAlt("  ");

		assertThat(validator.validate(input))
				.containsExactly(new FieldError("/colors/0/alt", "NOTBLANK"));
	}

	@Test
	void unknownVariantColorIsReported() {
		AdminProductInput input = validInput();
		input.getVariants().get(0).setColorCode("red");

		assertThat(validator.validate(input))
				.containsExactly(new FieldError("/variants/0/colorCode", "UNKNOWN_COLOR"));
	}

	@Test
	void duplicateVariantSlugAtSecondPositionIsReported() {
		AdminProductInput input = validInput();
		input.getVariants().get(1).setSlug("test-phone-black-128");

		assertThat(validator.validate(input))
				.containsExactly(new FieldError("/variants/1/slug", "DUPLICATE_VARIANT_SLUG"));
	}

	@Test
	void duplicateColorStoragePairAtSecondPositionIsReported() {
		AdminProductInput input = validInput();
		input.getVariants().get(1).setColorCode("black");
		input.getVariants().get(1).setStorageGb(StorageGb.NUMBER_128);

		assertThat(validator.validate(input))
				.containsExactly(new FieldError("/variants/1/storageGb", "DUPLICATE_VARIANT"));
	}

	@Test
	void variantIdLongerThanTheLimitIsReported() {
		AdminProductInput input = validInput();
		input.setSlug("p".repeat(75));
		input.getVariants().remove(1);

		assertThat(validator.validate(input))
				.containsExactly(new FieldError("/variants/0/colorCode", "VARIANT_ID_TOO_LONG")
						.putParamsItem("max", 80));
	}

	@Test
	void variantIdOfExactlyTheLimitIsAccepted() {
		AdminProductInput input = validInput();
		input.setSlug("p".repeat(68));

		assertThat(validator.validate(input)).isEmpty();
	}

	@Test
	void blankSpecGroupTitleIsReported() {
		AdminProductInput input = validInput();
		input.getSpecGroups().get(0).setTitle("  ");

		assertThat(validator.validate(input))
				.containsExactly(new FieldError("/specGroups/0/title", "NOTBLANK"));
	}

	@Test
	void blankSpecRowLabelIsReported() {
		AdminProductInput input = validInput();
		input.getSpecGroups().get(0).getRows().get(0).setLabel("  ");

		assertThat(validator.validate(input))
				.containsExactly(new FieldError("/specGroups/0/rows/0/label", "NOTBLANK"));
	}

	@Test
	void blankSpecRowValueIsReported() {
		AdminProductInput input = validInput();
		input.getSpecGroups().get(0).getRows().get(0).setValue("  ");

		assertThat(validator.validate(input))
				.containsExactly(new FieldError("/specGroups/0/rows/0/value", "NOTBLANK"));
	}

	@Test
	void nullHighlightAtSecondPositionIsRequired() {
		AdminProductInput input = validInput();
		input.getHighlights().set(1, null);

		assertThat(validator.validate(input))
				.containsExactly(new FieldError("/highlights/1", "REQUIRED"));
	}

	@Test
	void nullColorAtSecondPositionIsRequired() {
		AdminProductInput input = validInput();
		input.getColors().set(1, null);
		input.getVariants().remove(1);

		assertThat(validator.validate(input))
				.containsExactly(new FieldError("/colors/1", "REQUIRED"));
	}

	@Test
	void nullColorAlsoMakesItsVariantsUnknown() {
		AdminProductInput input = validInput();
		input.getColors().set(1, null);

		assertThat(validator.validate(input))
				.containsExactly(
						new FieldError("/colors/1", "REQUIRED"),
						new FieldError("/variants/1/colorCode", "UNKNOWN_COLOR"));
	}

	@Test
	void nullVariantAtSecondPositionIsRequired() {
		AdminProductInput input = validInput();
		input.getVariants().set(1, null);

		assertThat(validator.validate(input))
				.containsExactly(new FieldError("/variants/1", "REQUIRED"));
	}

	@Test
	void nullSpecGroupIsRequired() {
		AdminProductInput input = validInput();
		input.getSpecGroups().add(null);

		assertThat(validator.validate(input))
				.containsExactly(new FieldError("/specGroups/1", "REQUIRED"));
	}

	@Test
	void nullSpecRowIsRequired() {
		AdminProductInput input = validInput();
		input.getSpecGroups().get(0).getRows().add(null);

		assertThat(validator.validate(input))
				.containsExactly(new FieldError("/specGroups/0/rows/1", "REQUIRED"));
	}

	@Test
	void everyViolationIsReportedOnceInInputOrder() {
		AdminProductInput input = validInput();
		input.setBrand("  ");
		input.getColors().get(1).setCode("black");
		input.getVariants().get(0).setColorCode("red");
		input.getVariants().get(1).setColorCode("black");

		assertThat(validator.validate(input))
				.containsExactly(
						new FieldError("/brand", "NOTBLANK"),
						new FieldError("/colors/1/code", "DUPLICATE_COLOR_CODE"),
						new FieldError("/variants/0/colorCode", "UNKNOWN_COLOR"));
	}

	private static AdminProductInput validInput() {
		AdminProductInput input = new AdminProductInput();
		input.setSlug("test-phone");
		input.setBrand("Test");
		input.setName("Test Phone");
		input.setDescription("Leírás");
		input.setIs5g(true);
		input.setReleasedAt(LocalDate.of(2026, 1, 15));
		input.setRank(10);
		input.setPopularityScore(50);
		input.setFeatured(false);
		input.setHighlights(new ArrayList<>(List.of("A", "B")));
		input.setColors(new ArrayList<>(List.of(
				color("black", "Fekete", "#000000", "a".repeat(64), "Fekete telefon"),
				color("white", "Fehér", "#FFFFFF", "b".repeat(64), "Fehér telefon"))));
		input.setVariants(new ArrayList<>(List.of(
				variant("test-phone-black-128", "black", StorageGb.NUMBER_128, 100000, 3),
				variant("test-phone-white-256", "white", StorageGb.NUMBER_256, 120000, 0))));
		input.setSpecGroups(new ArrayList<>(List.of(
				new AdminSpecGroup("Kijelző", new ArrayList<>(List.of(
						new AdminSpecRow("Méret", "6,1\"")))))));
		return input;
	}

	private static AdminProductColorInput color(String code, String name, String swatchHex,
			String imageId, String alt) {
		return new AdminProductColorInput(code, name, swatchHex, imageId, alt);
	}

	private static AdminProductVariantInput variant(String slug, String colorCode,
			StorageGb storageGb, int priceHuf, int stock) {
		return new AdminProductVariantInput(slug, colorCode, storageGb,
				new Money(priceHuf, Money.CurrencyEnum.HUF), stock);
	}

}
