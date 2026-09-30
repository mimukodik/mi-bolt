package com.example.mi_bolt_backend.catalog;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface CatalogImageRepository extends JpaRepository<CatalogImage, String> {

	Optional<CatalogImage> findFirstByOrderByIdAsc();
}
