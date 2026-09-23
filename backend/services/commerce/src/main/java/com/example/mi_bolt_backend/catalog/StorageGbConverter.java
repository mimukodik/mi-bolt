package com.example.mi_bolt_backend.catalog;

import org.springframework.core.convert.converter.Converter;
import org.springframework.stereotype.Component;

import com.example.mi_bolt_backend.api.model.StorageGb;

/**
 * Binds the {@code storageGb} query parameter. The generated
 * {@code EnumConverterConfiguration} converts only from {@code Integer};
 * a query value arrives as a {@code String}.
 */
@Component
public class StorageGbConverter implements Converter<String, StorageGb> {

	@Override
	public StorageGb convert(String source) {
		return StorageGb.fromValue(Integer.valueOf(source));
	}
}