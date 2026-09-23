package com.example.mi_bolt_backend.catalog;

import java.io.InputStream;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import com.example.mi_bolt_backend.api.model.ProblemCode;
import com.example.mi_bolt_backend.test.ContractValidation;
import com.example.mi_bolt_backend.test.IntegrationTest;

/**
 * T4a: media serving through the real dispatcher. Asserts the contract on
 * every response (200 bytes + headers, 404 Problem), the long-lived immutable
 * Cache-Control header, and the absence of Set-Cookie on a public endpoint.
 */
@IntegrationTest
class MediaControllerTest {

	@Autowired
	private MockMvc mockMvc;

	private static final String NAVY_SHA = "0494688791f55f77852d95d4aff487aa89ffd0d6c300a64c56ed4ff08c3be5b8";
	private static final String NAVY_SIZE = "84112";

	@Test
	void getMediaReturnsImageBytesAndImmutableCacheControl() throws Exception {
		byte[] expected;
		try (InputStream in = getClass().getResourceAsStream("/catalog/images/" + NAVY_SHA + ".png")) {
			expected = in.readAllBytes();
		}
		mockMvc.perform(get("/media/" + NAVY_SHA))
				.andExpect(status().isOk())
				.andExpect(header().string("Content-Type", "image/png"))
				.andExpect(header().string("Cache-Control", "public, max-age=31536000, immutable"))
				.andExpect(header().string("Content-Length", NAVY_SIZE))
				.andExpect(header().longValue("Content-Length", Long.parseLong(NAVY_SIZE)))
				.andExpect(content().bytes(expected))
				.andExpect(ContractValidation.validAgainstContract());
	}

	@Test
	void getMediaOnUnknownIdReturns404Problem() throws Exception {
		mockMvc.perform(get("/media/does-not-exist"))
				.andExpect(status().isNotFound())
				.andExpect(header().string("Content-Type", startsWith("application/problem+json")))
				.andExpect(jsonPath("$.code").value(ProblemCode.NOT_FOUND.name()))
				.andExpect(jsonPath("$.params.imageId").value("does-not-exist"))
				.andExpect(ContractValidation.validAgainstContract());
	}

	@Test
	void getMediaDoesNotSetCookie() throws Exception {
		mockMvc.perform(get("/media/" + NAVY_SHA))
				.andExpect(status().isOk())
				.andExpect(header().doesNotExist("Set-Cookie"));
	}

	@Test
	void getMediaContentLengthMatchesStoredBytes() throws Exception {
		mockMvc.perform(get("/media/" + NAVY_SHA))
				.andExpect(header().string("Content-Length", equalTo(NAVY_SIZE)));
	}

	@Test
	void getMediaContentTypeIsImagePngForFixturePng() throws Exception {
		mockMvc.perform(get("/media/" + NAVY_SHA))
				.andExpect(header().string("Content-Type", containsString("image/png")));
	}

	@Test
	void getMediaOnUnknownIdDoesNotSetCookieEither() throws Exception {
		mockMvc.perform(get("/media/missing-id"))
				.andExpect(status().isNotFound())
				.andExpect(header().doesNotExist("Set-Cookie"));
	}
}
