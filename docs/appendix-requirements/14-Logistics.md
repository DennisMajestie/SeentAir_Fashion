# 14. Logistics & Delivery

## Delivery methods in use

- Dispatch riders (local delivery)
- Logistics companies
- Transport companies
- Interstate/city-to-city delivery
- International delivery

## Pricing

- Delivery cost is calculated by **weight and location**.
- Some destinations may require multiple delivery legs — the system should be able to represent a delivery as more than one stage/leg where needed.

## Integration priority

First logistics company to integrate: **GIGL**.

## Requirements

Record and display delivery status and tracking information per order.

## Data/entities implied

- `DeliveryLeg` (order id, carrier, leg_number, status, tracking_ref)
- `DeliveryPricing` (weight, destination/zone, calculated cost)
