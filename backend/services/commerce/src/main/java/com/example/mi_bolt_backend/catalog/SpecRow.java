package com.example.mi_bolt_backend.catalog;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "spec_row")
public class SpecRow {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "spec_group_id", nullable = false)
	private SpecGroup specGroup;

	@Column(nullable = false)
	private Integer position;

	@Column(nullable = false, length = 120)
	private String label;

	@Column(name = "row_value", nullable = false, length = 2000)
	private String rowValue;

	public Long getId() {
		return id;
	}

	public SpecGroup getSpecGroup() {
		return specGroup;
	}

	public void setSpecGroup(SpecGroup specGroup) {
		this.specGroup = specGroup;
	}

	public Integer getPosition() {
		return position;
	}

	public void setPosition(Integer position) {
		this.position = position;
	}

	public String getLabel() {
		return label;
	}

	public void setLabel(String label) {
		this.label = label;
	}

	public String getRowValue() {
		return rowValue;
	}

	public void setRowValue(String rowValue) {
		this.rowValue = rowValue;
	}
}
