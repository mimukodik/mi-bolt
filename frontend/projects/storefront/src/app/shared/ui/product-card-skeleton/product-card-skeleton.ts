import { Component } from '@angular/core';

/**
 * Stands in for one `ProductCard` while its grid waits for the catalogue
 * API (`docs/design/yettel.md`, "Skeleton loaders and their fade-out",
 * the "Product card skeleton" bullet). It takes the card's own frame and a
 * shimmer block for each line of the card, so the grid keeps its shape
 * when the cards arrive. The template that shows it puts `appSkeletonLeave`
 * on the element its control-flow block removes.
 */
@Component({
  selector: 'app-product-card-skeleton',
  templateUrl: './product-card-skeleton.html',
  styleUrl: './product-card-skeleton.scss',
})
export class ProductCardSkeleton {}
