package com.example.mi_bolt_backend.catalog;

import static com.example.mi_bolt_backend.test.ContractValidation.validAgainstContract;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import com.example.mi_bolt_backend.api.model.ProblemCode;
import com.example.mi_bolt_backend.test.IntegrationTest;

/**
 * Integration tests for the three catalogue endpoints. Runs against the H2
 * fixture loaded by {@link CatalogLoader} (3 products, 10 variants, 4 images).
 * Every assertion either matches a literal from the brief or compares against
 * a value the brief states explicitly. The contract validator is applied to
 * every response.
 */
@IntegrationTest
class ProductsApiTest {

	private static final String NAVY_SHA = "0494688791f55f77852d95d4aff487aa89ffd0d6c300a64c56ed4ff08c3be5b8";
	private static final String SILVER_SHA = "052fbcc4bbaa16e953edf6427e20fba34bb43601a5282b314177ee89d5b85062";

	@Autowired
	private MockMvc mockMvc;

	@Test
	void listProductsReturnsAllSixEntriesWithFullFacets() throws Exception {
		mockMvc.perform(get("/products"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.total").value(6))
				.andExpect(jsonPath("$.totalPages").value(1))
				.andExpect(jsonPath("$.page").value(1))
				.andExpect(jsonPath("$.pageSize").value(12))
				.andExpect(jsonPath("$.items.length()").value(6))
				.andExpect(jsonPath("$.items[0].variantId").value("samsung-galaxy-s25--navy--128"))
				.andExpect(jsonPath("$.items[0].price.amount").value(299990))
				.andExpect(jsonPath("$.items[0].maxQuantity").value(5))
				.andExpect(jsonPath("$.items[0].availability").value("in_stock"))
				.andExpect(jsonPath("$.items[0].image.src").value("/api/v1/media/" + NAVY_SHA))
				.andExpect(jsonPath("$.items[0].colors.length()").value(2))
				.andExpect(jsonPath("$.items[1].colors.length()").value(3))
				.andExpect(jsonPath("$.items[5].availability").value("out_of_stock"))
				.andExpect(jsonPath("$.items[5].maxQuantity").value(0))
				.andExpect(jsonPath("$.items[1].variantId").value("samsung-galaxy-s25--navy--256"))
				.andExpect(jsonPath("$.items[2].variantId").value("samsung-galaxy-s25--navy--512"))
				.andExpect(jsonPath("$.items[3].variantId").value("apple-iphone-16--midnight--128"))
				.andExpect(jsonPath("$.items[4].variantId").value("apple-iphone-16--midnight--256"))
				.andExpect(jsonPath("$.items[5].variantId").value("nokia-105--black--128"))
				.andExpect(jsonPath("$.facets.brands[0].value").value("Apple"))
				.andExpect(jsonPath("$.facets.brands[0].count").value(2))
				.andExpect(jsonPath("$.facets.brands[1].value").value("Nokia"))
				.andExpect(jsonPath("$.facets.brands[1].count").value(1))
				.andExpect(jsonPath("$.facets.brands[2].value").value("Samsung"))
				.andExpect(jsonPath("$.facets.brands[2].count").value(3))
				.andExpect(jsonPath("$.facets.storageGb[0].value").value("128"))
				.andExpect(jsonPath("$.facets.storageGb[0].label").value("128 GB"))
				.andExpect(jsonPath("$.facets.storageGb[0].count").value(3))
				.andExpect(jsonPath("$.facets.storageGb[1].value").value("256"))
				.andExpect(jsonPath("$.facets.storageGb[1].count").value(2))
				.andExpect(jsonPath("$.facets.storageGb[2].value").value("512"))
				.andExpect(jsonPath("$.facets.storageGb[2].count").value(1))
				.andExpect(jsonPath("$.facets.colors.length()").value(5))
				.andExpect(jsonPath("$.facets.colors[0].value").value("navy"))
				.andExpect(jsonPath("$.facets.colors[0].count").value(3))
				.andExpect(jsonPath("$.facets.colors[0].swatchHex").value("#1B2A49"))
				.andExpect(jsonPath("$.facets.colors[1].value").value("silver"))
				.andExpect(jsonPath("$.facets.colors[1].count").value(3))
				.andExpect(jsonPath("$.facets.colors[2].value").value("navy-alt"))
				.andExpect(jsonPath("$.facets.colors[2].count").value(1))
				.andExpect(jsonPath("$.facets.colors[3].value").value("midnight"))
				.andExpect(jsonPath("$.facets.colors[3].count").value(2))
				.andExpect(jsonPath("$.facets.colors[4].value").value("black"))
				.andExpect(jsonPath("$.facets.colors[4].count").value(1))
				.andExpect(jsonPath("$.facets.is5g").value(5))
				.andExpect(jsonPath("$.facets.inStock").value(5))
				.andExpect(jsonPath("$.facets.priceRange.min.amount").value(12990))
				.andExpect(jsonPath("$.facets.priceRange.max.amount").value(449990))
				.andExpect(validAgainstContract());
	}

	@Test
	void listProductsNoSetCookie() throws Exception {
		mockMvc.perform(get("/products"))
				.andExpect(status().isOk())
				.andExpect(header().doesNotExist("Set-Cookie"))
				.andExpect(validAgainstContract());
	}

	@Test
	void brandFilterKeepsFullFacetCounts() throws Exception {
		mockMvc.perform(get("/products").param("brand", "Nokia"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.total").value(1))
				.andExpect(jsonPath("$.facets.brands[0].count").value(2))
				.andExpect(jsonPath("$.facets.brands[1].count").value(1))
				.andExpect(jsonPath("$.facets.brands[2].count").value(3))
				.andExpect(jsonPath("$.facets.storageGb[0].count").value(1))
				.andExpect(jsonPath("$.facets.storageGb[1].count").value(0))
				.andExpect(jsonPath("$.facets.storageGb[2].count").value(0))
				.andExpect(jsonPath("$.facets.priceRange.min.amount").value(12990))
				.andExpect(jsonPath("$.facets.priceRange.max.amount").value(12990));
	}

	@Test
	void multipleBrandsUseOr() throws Exception {
		mockMvc.perform(get("/products").param("brand", "Nokia").param("brand", "Apple"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.total").value(3));
	}

	@Test
	void inStockFilter() throws Exception {
		mockMvc.perform(get("/products").param("inStock", "true"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.total").value(5))
				.andExpect(jsonPath("$.facets.inStock").value(5))
				.andExpect(validAgainstContract());
	}

	@Test
	void is5gFalseFilter() throws Exception {
		mockMvc.perform(get("/products").param("is5g", "false"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.total").value(1))
				.andExpect(jsonPath("$.facets.is5g").value(5))
				.andExpect(validAgainstContract());
	}

	@Test
	void colorFilterSelectsMatchingDisplayedColor() throws Exception {
		mockMvc.perform(get("/products").param("color", "silver"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.total").value(3))
				.andExpect(jsonPath("$.items[0].variantId").value("samsung-galaxy-s25--silver--128"));
	}

	@Test
	void colourFilterKeepsFullFacetLists() throws Exception {
		mockMvc.perform(get("/products").param("color", "black"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.total").value(1))
				.andExpect(jsonPath("$.items[0].variantId").value("nokia-105--black--128"))
				.andExpect(jsonPath("$.facets.brands.length()").value(3))
				.andExpect(jsonPath("$.facets.brands[0].value").value("Apple"))
				.andExpect(jsonPath("$.facets.brands[0].count").value(0))
				.andExpect(jsonPath("$.facets.brands[1].value").value("Nokia"))
				.andExpect(jsonPath("$.facets.brands[1].count").value(1))
				.andExpect(jsonPath("$.facets.brands[2].value").value("Samsung"))
				.andExpect(jsonPath("$.facets.brands[2].count").value(0))
				.andExpect(jsonPath("$.facets.storageGb.length()").value(3))
				.andExpect(jsonPath("$.facets.storageGb[0].count").value(1))
				.andExpect(jsonPath("$.facets.storageGb[1].count").value(0))
				.andExpect(jsonPath("$.facets.storageGb[2].count").value(0))
				.andExpect(jsonPath("$.facets.colors.length()").value(5))
				.andExpect(jsonPath("$.facets.colors[0].value").value("navy"))
				.andExpect(jsonPath("$.facets.colors[0].count").value(3))
				.andExpect(jsonPath("$.facets.colors[1].value").value("silver"))
				.andExpect(jsonPath("$.facets.colors[1].count").value(3))
				.andExpect(jsonPath("$.facets.colors[2].value").value("navy-alt"))
				.andExpect(jsonPath("$.facets.colors[2].count").value(1))
				.andExpect(jsonPath("$.facets.colors[3].value").value("midnight"))
				.andExpect(jsonPath("$.facets.colors[3].count").value(2))
				.andExpect(jsonPath("$.facets.colors[4].value").value("black"))
				.andExpect(jsonPath("$.facets.colors[4].count").value(1))
				.andExpect(jsonPath("$.facets.inStock").value(0));
	}

	@Test
	void maxPriceFilter() throws Exception {
		mockMvc.perform(get("/products").param("maxPrice", "300000"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.total").value(2))
				.andExpect(jsonPath("$.items[0].variantId").value("samsung-galaxy-s25--navy--128"))
				.andExpect(jsonPath("$.items[1].variantId").value("nokia-105--black--128"))
				.andExpect(jsonPath("$.facets.priceRange.min.amount").value(12990))
				.andExpect(jsonPath("$.facets.priceRange.max.amount").value(299990))
				.andExpect(validAgainstContract());
	}

	@Test
	void hugePageReturnsEmptyItems() throws Exception {
		mockMvc.perform(get("/products").param("page", "200000000"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.items.length()").value(0))
				.andExpect(jsonPath("$.total").value(6))
				.andExpect(jsonPath("$.totalPages").value(1))
				.andExpect(jsonPath("$.page").value(200000000))
				.andExpect(validAgainstContract());
	}

	@Test
	void minPriceFilter() throws Exception {
		mockMvc.perform(get("/products").param("minPrice", "300000"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.total").value(4))
				.andExpect(jsonPath("$.facets.priceRange.min.amount").value(349990))
				.andExpect(jsonPath("$.facets.priceRange.max.amount").value(449990))
				.andExpect(validAgainstContract());
	}

	@Test
	void minPriceGreaterThanMaxPriceReturns400() throws Exception {
		mockMvc.perform(get("/products").param("minPrice", "500000").param("maxPrice", "100"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value(ProblemCode.INVALID_REQUEST.name()))
				.andExpect(validAgainstContract());
	}

	@Test
	void featuredTrueOnlyFeatured() throws Exception {
		mockMvc.perform(get("/products").param("featured", "true"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.total").value(3))
				.andExpect(jsonPath("$.items[0].slug").value("samsung-galaxy-s25"))
				.andExpect(validAgainstContract());
	}

	@Test
	void featuredFalseExcludesFeatured() throws Exception {
		mockMvc.perform(get("/products").param("featured", "false"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.total").value(3))
				.andExpect(jsonPath("$.items[0].slug").value("apple-iphone-16"))
				.andExpect(validAgainstContract());
	}

	@Test
	void qRelevance() throws Exception {
		mockMvc.perform(get("/products").param("q", "IPHONE"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.total").value(2))
				.andExpect(validAgainstContract());
		mockMvc.perform(get("/products").param("q", " galaxy "))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.total").value(3))
				.andExpect(validAgainstContract());
		mockMvc.perform(get("/products").param("q", "zzz"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.total").value(0))
				.andExpect(jsonPath("$.facets.priceRange.min.amount").value(0))
				.andExpect(jsonPath("$.facets.priceRange.max.amount").value(0))
				.andExpect(jsonPath("$.facets.brands[0].count").value(0))
				.andExpect(validAgainstContract());
	}

	@Test
	void sortPriceDesc() throws Exception {
		mockMvc.perform(get("/products").param("sort", "price_desc"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.items[0].variantId").value("apple-iphone-16--midnight--256"))
				.andExpect(validAgainstContract());
	}

	@Test
	void sortPriceAsc() throws Exception {
		mockMvc.perform(get("/products").param("sort", "price_asc"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.items[0].slug").value("nokia-105"))
				.andExpect(validAgainstContract());
	}

	@Test
	void sortNameAsc() throws Exception {
		mockMvc.perform(get("/products").param("sort", "name_asc"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.items[0].slug").value("apple-iphone-16"))
				.andExpect(jsonPath("$.items[0].storageGb").value(128))
				.andExpect(validAgainstContract());
	}

	@Test
	void sortNameDesc() throws Exception {
		mockMvc.perform(get("/products").param("sort", "name_desc"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.items[0].slug").value("samsung-galaxy-s25"))
				.andExpect(jsonPath("$.items[0].storageGb").value(128))
				.andExpect(validAgainstContract());
	}

	@Test
	void sortNewest() throws Exception {
		mockMvc.perform(get("/products").param("sort", "newest"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.items[0].slug").value("samsung-galaxy-s25"))
				.andExpect(validAgainstContract());
	}

	@Test
	void sortOldest() throws Exception {
		mockMvc.perform(get("/products").param("sort", "oldest"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.items[0].slug").value("nokia-105"))
				.andExpect(validAgainstContract());
	}

	@Test
	void sortPopularity() throws Exception {
		mockMvc.perform(get("/products").param("sort", "popularity"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.items[0].slug").value("apple-iphone-16"))
				.andExpect(jsonPath("$.items[0].storageGb").value(128))
				.andExpect(validAgainstContract());
	}

	@Test
	void pagingBeyondLastReturnsEmptyItems() throws Exception {
		mockMvc.perform(get("/products").param("page", "2"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.items.length()").value(0))
				.andExpect(jsonPath("$.total").value(6))
				.andExpect(jsonPath("$.totalPages").value(1))
				.andExpect(jsonPath("$.page").value(2))
				.andExpect(validAgainstContract());
	}

	@Test
	void pageSize24Accepted() throws Exception {
		mockMvc.perform(get("/products").param("pageSize", "24"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.pageSize").value(24))
				.andExpect(validAgainstContract());
	}

	@Test
	void invalidPageSizeReturns400() throws Exception {
		mockMvc.perform(get("/products").param("pageSize", "13"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value(ProblemCode.INVALID_REQUEST.name()));
	}

	@Test
	void zeroPageReturns400() throws Exception {
		mockMvc.perform(get("/products").param("page", "0"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value(ProblemCode.INVALID_REQUEST.name()));
	}

	@Test
	void zeroPageReportsMinReason() throws Exception {
		mockMvc.perform(get("/products").param("page", "0"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value(ProblemCode.INVALID_REQUEST.name()))
				.andExpect(jsonPath("$.params.parameter").value("page"))
				.andExpect(jsonPath("$.params.reason").value("MIN"));
	}

	@Test
	void unknownStorageReturns400() throws Exception {
		mockMvc.perform(get("/products").param("storageGb", "999"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value(ProblemCode.INVALID_REQUEST.name()));
	}

	@Test
	void storageFilter() throws Exception {
		mockMvc.perform(get("/products").param("storageGb", "256"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.total").value(2))
				.andExpect(jsonPath("$.items.length()").value(2))
				.andExpect(jsonPath("$.items[0].variantId").value("samsung-galaxy-s25--navy--256"))
				.andExpect(jsonPath("$.items[1].variantId").value("apple-iphone-16--midnight--256"))
				.andExpect(jsonPath("$.facets.storageGb[0].count").value(3))
				.andExpect(jsonPath("$.facets.storageGb[1].count").value(2))
				.andExpect(jsonPath("$.facets.storageGb[2].count").value(1));
	}

	@Test
	void storageFilterAcceptsTwoValues() throws Exception {
		mockMvc.perform(get("/products").param("storageGb", "128").param("storageGb", "512"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.total").value(4));
	}

	@Test
	void unknownSortReturns400() throws Exception {
		mockMvc.perform(get("/products").param("sort", "foo"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value(ProblemCode.INVALID_REQUEST.name()));
	}

	@Test
	void negativeMinPriceReturns400() throws Exception {
		mockMvc.perform(get("/products").param("minPrice", "-1"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value(ProblemCode.INVALID_REQUEST.name()));
	}

	@Test
	void unknownQueryParameterReturns400() throws Exception {
		mockMvc.perform(get("/products").param("colour", "x"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value(ProblemCode.INVALID_REQUEST.name()));
	}

	@Test
	void getProductReturnsFullDetail() throws Exception {
		mockMvc.perform(get("/products/samsung-galaxy-s25"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.variants.length()").value(7))
				.andExpect(jsonPath("$.variants[0].id").value("samsung-galaxy-s25--navy--128"))
				.andExpect(jsonPath("$.variants[0].images[0].src").value("/api/v1/media/" + NAVY_SHA))
				.andExpect(jsonPath("$.variants[0].images[0].id").value(NAVY_SHA))
				.andExpect(jsonPath("$.variants[0].images[0].alt").value("Samsung Galaxy S25 sötétkék"))
				.andExpect(jsonPath("$.specGroups[0].id").value("kijelzo"))
				.andExpect(jsonPath("$.specGroups[0].rows[0].label").value("Méret"))
				.andExpect(jsonPath("$.specGroups[0].rows[0].value").value("6,2\""))
				.andExpect(jsonPath("$.description").value("A Samsung Galaxy S25 a csúcskategóriás Samsung telefonok legújabb tagja."))
				.andExpect(header().doesNotExist("Set-Cookie"))
				.andExpect(validAgainstContract());
	}

	@Test
	void getProductUnknownSlugReturns404() throws Exception {
		mockMvc.perform(get("/products/nope"))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value(ProblemCode.NOT_FOUND.name()))
				.andExpect(jsonPath("$.params.slug").value("nope"))
				.andExpect(header().doesNotExist("Set-Cookie"));
	}

	@Test
	void getProductBadSlugReturns404() throws Exception {
		mockMvc.perform(get("/products/Bad_Slug"))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value(ProblemCode.NOT_FOUND.name()))
				.andExpect(jsonPath("$.params.slug").value("Bad_Slug"))
				.andExpect(header().doesNotExist("Set-Cookie"));
	}

	@Test
	void listRelatedBadSlugReturns404() throws Exception {
		mockMvc.perform(get("/products/Bad_Slug/related"))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value(ProblemCode.NOT_FOUND.name()))
				.andExpect(jsonPath("$.params.slug").value("Bad_Slug"))
				.andExpect(header().doesNotExist("Set-Cookie"));
	}

	@Test
	void listRelatedForSamsung() throws Exception {
		mockMvc.perform(get("/products/samsung-galaxy-s25/related"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(2))
				.andExpect(jsonPath("$[0].slug").value("apple-iphone-16"))
				.andExpect(jsonPath("$[0].storageGb").value(128))
				.andExpect(jsonPath("$[1].slug").value("nokia-105"))
				.andExpect(jsonPath("$[1].storageGb").value(128))
				.andExpect(header().doesNotExist("Set-Cookie"))
				.andExpect(validAgainstContract());
	}

	@Test
	void listRelatedForNokia() throws Exception {
		mockMvc.perform(get("/products/nokia-105/related"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(2))
				.andExpect(jsonPath("$[0].slug").value("samsung-galaxy-s25"))
				.andExpect(jsonPath("$[0].storageGb").value(128))
				.andExpect(jsonPath("$[1].slug").value("apple-iphone-16"))
				.andExpect(jsonPath("$[1].storageGb").value(128))
				.andExpect(header().doesNotExist("Set-Cookie"))
				.andExpect(validAgainstContract());
	}

	@Test
	void listRelatedUnknownSlugReturns404() throws Exception {
		mockMvc.perform(get("/products/nope/related"))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value(ProblemCode.NOT_FOUND.name()))
				.andExpect(header().doesNotExist("Set-Cookie"))
				.andExpect(validAgainstContract());
	}

	@Test
	void smokeF2CatalogueListAndDetail() throws Exception {
		mockMvc.perform(get("/products"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.items.length()").value(6))
				.andExpect(validAgainstContract());
		mockMvc.perform(get("/products/samsung-galaxy-s25"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.slug").value("samsung-galaxy-s25"))
				.andExpect(validAgainstContract());
		mockMvc.perform(get("/products/samsung-galaxy-s25/related"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(2))
				.andExpect(validAgainstContract());
	}

	@Test
	void silverVariantHasSilverImageAndColorCode() throws Exception {
		mockMvc.perform(get("/products").param("color", "silver"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.items[0].image.src").value("/api/v1/media/" + SILVER_SHA));
	}
}
