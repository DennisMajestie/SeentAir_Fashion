# 04. Products

## What needs to be managed per product

- Product (name, description)
- Category
- Size
- Colour
- Collection
- SKU / stock identifier
- Price (retail and wholesale price — see `06-Wholesale.md` for tiers)
- Product image(s)
- Availability (in stock / out of stock / made-to-order)
- Link to production batch(es)

## Data/entities implied

- `Product` (name, description, category, base price)
- `ProductVariant` (product id, size, colour, SKU, price override, image, availability)
- `Collection` (name, list of product ids)

## Confirmed by client

YES, this represents how products should be managed.
