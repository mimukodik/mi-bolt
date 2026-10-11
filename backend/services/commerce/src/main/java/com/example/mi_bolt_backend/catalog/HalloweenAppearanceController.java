package com.example.mi_bolt_backend.catalog;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

import com.example.mi_bolt_backend.api.AdminCampaignSettingsApi;
import com.example.mi_bolt_backend.api.model.HalloweenAppearance;
import com.example.mi_bolt_backend.api.model.HalloweenAppearanceInput;

@RestController
public class HalloweenAppearanceController implements AdminCampaignSettingsApi {
	private final HalloweenAppearanceService service;

	public HalloweenAppearanceController(HalloweenAppearanceService service) {
		this.service = service;
	}

	@Override
	public ResponseEntity<HalloweenAppearance> getHalloweenAppearance() {
		return response(service.read());
	}

	@Override
	public ResponseEntity<HalloweenAppearance> updateHalloweenAppearance(HalloweenAppearanceInput input, String ifMatch) {
		return response(service.replace(input, ifMatch));
	}

	private static ResponseEntity<HalloweenAppearance> response(HalloweenAppearance settings) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
				.eTag("\"" + settings.getVersion() + "\"").body(settings);
	}
}
