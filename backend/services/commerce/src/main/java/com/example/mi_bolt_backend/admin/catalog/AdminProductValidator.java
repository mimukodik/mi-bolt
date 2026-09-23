package com.example.mi_bolt_backend.admin.catalog;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.springframework.stereotype.Component;

import com.example.mi_bolt_backend.api.model.AdminProductColorInput;
import com.example.mi_bolt_backend.api.model.AdminProductInput;
import com.example.mi_bolt_backend.api.model.AdminProductVariantInput;
import com.example.mi_bolt_backend.api.model.AdminSpecGroup;
import com.example.mi_bolt_backend.api.model.AdminSpecRow;
import com.example.mi_bolt_backend.api.model.FieldError;
import com.example.mi_bolt_backend.api.model.StorageGb;
import com.example.mi_bolt_backend.catalog.CatalogValidator;

/**
 * Checks the cross-field rules of an admin product body — the ones no single
 * field's Bean Validation constraint can express — and returns every violation
 * as a {@link FieldError} carrying a JSON pointer into the request body, in
 * input order. Bean Validation runs first on the generated model (lengths and
 * patterns, {@link CatalogValidator}'s limits among them), this validator adds
 * the rules that need the whole body in view: duplicate colour codes, variant
 * references to an unknown colour, duplicate variant slugs, duplicate
 * (colour, storage) variant pairs, derived variant ids past
 * {@link CatalogValidator#MAX_VARIANT_ID}, texts that are blank after trim
 * ({@code NOTBLANK}, the code Bean Validation's {@code @NotBlank} produces)
 * and a {@code null} element inside a list ({@code REQUIRED}, the code Bean
 * Validation's {@code @NotNull} produces).
 *
 * <p>Pure and stateless: it reads the input and never throws. A {@code null}
 * list is skipped, because Bean Validation's {@code @NotNull} on the property
 * rejects it first; a {@code null} element inside a list is not covered by
 * Bean Validation and is reported here as {@code REQUIRED} at the element's
 * pointer.
 *
 * <p>{@code REQUIRED} is not in the same status class as the codes above: the
 * contract treats a missing required member as 400 {@code INVALID_REQUEST}
 * (contracts/commerce/kommunikacio.md §5.1), which is what the advice layer answers for Bean Validation's
 * own {@code @NotNull}, while a non-empty result of this validator is
 * otherwise 422 {@code VALIDATION_FAILED}. A caller answering the whole list
 * under one status has to split on {@code REQUIRED} to keep that separation,
 * which the contract calls mandatory.
 */
@Component
public class AdminProductValidator {

	public List<FieldError> validate(AdminProductInput input) {
		List<FieldError> errors = new ArrayList<>();
		if (input == null) {
			return errors;
		}
		addBlank(errors, "/brand", input.getBrand());
		addBlank(errors, "/name", input.getName());
		validateHighlights(input, errors);
		validateColors(input, errors);
		validateVariants(input, errors);
		validateSpecGroups(input, errors);
		return errors;
	}

	private static void addBlank(List<FieldError> errors, String path, String value) {
		if (value != null && value.isBlank()) {
			errors.add(new FieldError(path, "NOTBLANK"));
		}
	}

	private static void validateHighlights(AdminProductInput input, List<FieldError> errors) {
		List<String> highlights = input.getHighlights();
		if (highlights == null) {
			return;
		}
		for (int i = 0; i < highlights.size(); i++) {
			String highlight = highlights.get(i);
			if (highlight == null) {
				errors.add(new FieldError("/highlights/" + i, "REQUIRED"));
				continue;
			}
			addBlank(errors, "/highlights/" + i, highlight);
		}
	}

	private static void validateColors(AdminProductInput input, List<FieldError> errors) {
		List<AdminProductColorInput> colors = input.getColors();
		if (colors == null) {
			return;
		}
		Set<String> seenCodes = new HashSet<>();
		for (int i = 0; i < colors.size(); i++) {
			AdminProductColorInput color = colors.get(i);
			if (color == null) {
				errors.add(new FieldError("/colors/" + i, "REQUIRED"));
				continue;
			}
			String code = color.getCode();
			if (code != null && !seenCodes.add(code)) {
				errors.add(new FieldError("/colors/" + i + "/code", "DUPLICATE_COLOR_CODE"));
			}
			addBlank(errors, "/colors/" + i + "/name", color.getName());
			addBlank(errors, "/colors/" + i + "/alt", color.getAlt());
		}
	}

	private static void validateVariants(AdminProductInput input, List<FieldError> errors) {
		List<AdminProductVariantInput> variants = input.getVariants();
		if (variants == null) {
			return;
		}
		Set<String> knownCodes = knownColorCodes(input.getColors());
		Set<String> seenSlugs = new HashSet<>();
		Set<String> seenPairs = new HashSet<>();
		for (int i = 0; i < variants.size(); i++) {
			AdminProductVariantInput variant = variants.get(i);
			if (variant == null) {
				errors.add(new FieldError("/variants/" + i, "REQUIRED"));
				continue;
			}
			String colorCode = variant.getColorCode();
			if (!knownCodes.contains(colorCode)) {
				errors.add(new FieldError("/variants/" + i + "/colorCode", "UNKNOWN_COLOR"));
			}
			String slug = variant.getSlug();
			if (slug != null && !seenSlugs.add(slug)) {
				errors.add(new FieldError("/variants/" + i + "/slug", "DUPLICATE_VARIANT_SLUG"));
			}
			StorageGb storageGb = variant.getStorageGb();
			if (storageGb != null && colorCode != null
					&& !seenPairs.add(colorCode + "--" + storageGb.getValue())) {
				errors.add(new FieldError("/variants/" + i + "/storageGb", "DUPLICATE_VARIANT"));
			}
			addVariantIdTooLong(input.getSlug(), colorCode, storageGb, i, errors);
		}
	}

	private static void addVariantIdTooLong(String productSlug, String colorCode,
			StorageGb storageGb, int index, List<FieldError> errors) {
		if (productSlug == null || colorCode == null || storageGb == null) {
			return;
		}
		String variantId = productSlug + "--" + colorCode + "--" + storageGb.getValue();
		if (variantId.length() > CatalogValidator.MAX_VARIANT_ID) {
			errors.add(new FieldError("/variants/" + index + "/colorCode", "VARIANT_ID_TOO_LONG")
					.putParamsItem("max", CatalogValidator.MAX_VARIANT_ID));
		}
	}

	private static Set<String> knownColorCodes(List<AdminProductColorInput> colors) {
		Set<String> codes = new HashSet<>();
		if (colors == null) {
			return codes;
		}
		for (AdminProductColorInput color : colors) {
			if (color != null && color.getCode() != null) {
				codes.add(color.getCode());
			}
		}
		return codes;
	}

	private static void validateSpecGroups(AdminProductInput input, List<FieldError> errors) {
		List<AdminSpecGroup> groups = input.getSpecGroups();
		if (groups == null) {
			return;
		}
		for (int g = 0; g < groups.size(); g++) {
			AdminSpecGroup group = groups.get(g);
			if (group == null) {
				errors.add(new FieldError("/specGroups/" + g, "REQUIRED"));
				continue;
			}
			addBlank(errors, "/specGroups/" + g + "/title", group.getTitle());
			List<AdminSpecRow> rows = group.getRows();
			if (rows == null) {
				continue;
			}
			for (int r = 0; r < rows.size(); r++) {
				AdminSpecRow row = rows.get(r);
				if (row == null) {
					errors.add(new FieldError("/specGroups/" + g + "/rows/" + r, "REQUIRED"));
					continue;
				}
				addBlank(errors, "/specGroups/" + g + "/rows/" + r + "/label", row.getLabel());
				addBlank(errors, "/specGroups/" + g + "/rows/" + r + "/value", row.getValue());
			}
		}
	}

}
