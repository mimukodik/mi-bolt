package com.example.mi_bolt_backend.catalog;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;


@JsonIgnoreProperties(ignoreUnknown = true)
public class ColorDto {

	private String code;
	private String name;
	private String swatchHex;
	private ImageDto image;

	public String getCode() {
		return code;
	}

	public void setCode(String code) {
		this.code = code;
	}

	public String getName() {
		return name;
	}

	public void setName(String name) {
		this.name = name;
	}

	public String getSwatchHex() {
		return swatchHex;
	}

	public void setSwatchHex(String swatchHex) {
		this.swatchHex = swatchHex;
	}

	public ImageDto getImage() {
		return image;
	}

	public void setImage(ImageDto image) {
		this.image = image;
	}
}
