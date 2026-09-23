package com.example.mi_bolt_backend.catalog;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;


@JsonIgnoreProperties(ignoreUnknown = true)
public class SpecGroupDto {

	private String label;
	private List<SpecRowDto> rows;

	public String getLabel() {
		return label;
	}

	public void setLabel(String label) {
		this.label = label;
	}

	public List<SpecRowDto> getRows() {
		return rows;
	}

	public void setRows(List<SpecRowDto> rows) {
		this.rows = rows;
	}
}
