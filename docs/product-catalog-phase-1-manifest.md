# SmartChain Phase 1 import manifest

READ-ONLY PLAN. No database writes. Prepared 2026-09-07.

Source: C:/Users/Johnlei/.codex/attachments/1335a2de-50c7-4daa-a800-a6d8b6dbb920/pasted-text.txt

The complete attached text was read. Source line references below refer to that file. PostgreSQL products count was rechecked using a read-only connection: 0.

## Totals

- Total document entries: 70
- Total unique products: 69
- Duplicate entries: 1 redundant TOMAHAWK EC entry with identical category, description, and intended use
- Refractory Products: 21
- Construction Chemicals: 30
- Wood Preservative Products: 3 unique (4 source entries)
- Industrial Chemicals: 15
- Ready to import: 0
- Requires client input: 69
- Requires manual review: 0 standalone entries; 1 embedded product reference flagged below
- Already existing: 0

EXPECTED PRODUCT CATALOG RECORDS CREATED: 0

EXPECTED OPERATIONAL RECORDS CREATED: 0

## Interpretation and source quality

All products lack explicit catalog Unit, Cost Price, Selling Price, and Reorder Level. Material form, percentages, temperatures, and technical measurements do not supply these values. No pcs or zero defaults may substitute for client-confirmed values.

Brand is not separately identified. Product-name prefixes remain in the original names; Brand is left unset rather than inferred. SKU is not used by the client or required by the current schema/API. No SKU will be generated. The existing generated database primary key remains an internal identifier.

Description/Application: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD. Full source evidence is retained below only for review. No schema or API changes are proposed. Application availability includes explicit intended use in descriptive text and functional antifoam/defoamer labels; composition and certification alone do not establish an application.

TOMAHAWK EC: DUPLICATE — IMPORT ONCE after required values and approval. Both occurrences have identical text.

Coolcast G: REQUIRES MANUAL REVIEW of an embedded reference. It appears only in Coolcast's description as a hot-face recommendation, with no standalone entry. Confirm whether it should be a separate catalog product. It is excluded from the 70-entry/69-unique totals; no expanded product name or separate record is invented.

Preserve MegFlow PB, SPIK ‘N SPAN, and MegaAdd SP1(Powder) exactly as written. Kaolite 2800 has an empty Application heading but explicitly describes general-purpose insulating-castable use. Morflo 40 SIC contains both “ultra high strengths” and “low strengths”; QEMIDESCAL 977 ends in “marketA”. These source-text issues are retained and do not create identity conflicts among standalone entries.

## Existing mechanism and boundary

The inspected API requires Name, Unit, Cost Price, Selling Price, and Reorder Level; Category and Brand are nullable. The product creation method creates a Product and reads inventories. No operational creation hook was found, and the inspected PostgreSQL products table has no custom triggers. Existing foreign keys and product-selection endpoints remain untouched. With no inventory, existing presentation logic gives OUT OF STOCK.

Phase 2 requires explicit approval and resolved required values. Only approved READY TO IMPORT product-master records may be created. Verify the approved product count and zero operational records before commit. Any unexpected operational side effect requires rollback, stop, and reporting; no application/schema bypass is authorized.

## Complete unique-product manifest

### 1. Thermal Ceramics Tri-Mor Coolcast

- PRODUCT NAME: Thermal Ceramics Tri-Mor Coolcast
- CATEGORY: REFRACTORY PRODUCTS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 3

Source description/application evidence:

> An 1100 °C lightweight, insulating material installed by casting, gunning or trowelling. Use Coolcast G for hot face applications.
> Application:
> Cement Plant: Back-up Insulation
> Power Plant (CFB): Back-up Insulation
> Steel Plant: Back-up Insulation

### 2. Thermal Ceramics Tri-Mor Insulite

- PRODUCT NAME: Thermal Ceramics Tri-Mor Insulite
- CATEGORY: REFRACTORY PRODUCTS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 9

Source description/application evidence:

> A versatile 1370°C insulating material with low thermal conductivity. Can be installed by casting, gunning or trowelling.
> Application:
> Cement Plant: Back-up Insulation
> Power Plant (CFB): Back-up Insulation
> Steel Plant: Back-up Insulation

### 3. Thermal Ceramics Tri-Mor Extra HS Castable

- PRODUCT NAME: Thermal Ceramics Tri-Mor Extra HS Castable
- CATEGORY: REFRACTORY PRODUCTS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 15

Source description/application evidence:

> A 1250°C castable, based on low porosity aggregate with very high strength and excellent abrasion and thermal shock resistance. Can also be installed by gunning.
> Application:
> Cement Plant: Cyclones, Chain Section
> Power Plant (CFB): Cyclone Discharge

### 4. Thermal Ceramics Tri-Mor Hicast Super

- PRODUCT NAME: Thermal Ceramics Tri-Mor Hicast Super
- CATEGORY: REFRACTORY PRODUCTS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 20

Source description/application evidence:

> The unique Hicast bonding system gives this product ultra-high strengths at all temperatures, low porosity and excellent abrasion, impact and alkali resistance.
> Application:
> Cement Plant: Lower Precalciner/Riser, Lower Preheater/Riser, Feed Chute/Slope, Feed Cone, Chain Section, Dam, Burner Pipe, Nose Ring, Cooler, Bull Nose
> Power Plant (CFB): Combustor, Ash Return System
> Steel Plant: Hearths/Floors, Bogies

### 5. Thermal Ceramics Tri-Mor Hicast Extra

- PRODUCT NAME: Thermal Ceramics Tri-Mor Hicast Extra
- CATEGORY: REFRACTORY PRODUCTS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 26

Source description/application evidence:

> The unique Hicast bonding system gives this product ultra-high strengths at all temparatures, low porosity and excellent abrasion and impact resistance. Outstanding performance in slag and molten metal contact.
> Application:
> Cement Plant: Lower Precalciner/Riser, Lower Preheater/Riser, Feed Chute/Slope, Feed Cone, Chain Section, Dam, Burner Pipe, Nose Ring, Cooler, Bull Nose
> Power Plant (CFB): Combustor, Ash Return System
> Steel Plant: Hearths/Floors, Bogies

### 6. Thermal Ceramics Tri-Mor Higun 20 SIC

- PRODUCT NAME: Thermal Ceramics Tri-Mor Higun 20 SIC
- CATEGORY: REFRACTORY PRODUCTS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 32

Source description/application evidence:

> A 1450°C grade, low cement gunning material exhibiting high strengths at all temperatures, low porosity and excellent abrasion and impact resistance. Contains 20% SiC for increased metal and slag resistance. The Higun range of low cement gun mixes are designed to be installed with conventional gunning equipment and the Higun gunning nozzle. Higun combines the superior physical properties of a low cement castable with the practical advantages of a gunning material.
> Application:
> Cement Plant: Lower Precalciner/Riser, Lower Preheater/Riser, Feed Chute/Slope

### 7. Thermal Ceramics Tri-Mor Higun 40 SIC

- PRODUCT NAME: Thermal Ceramics Tri-Mor Higun 40 SIC
- CATEGORY: REFRACTORY PRODUCTS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 36

Source description/application evidence:

> A 1450°C grade, low cement gunning material, containing 40% Silicon Carbide, exhibiting high strengths at all temperatures, low porosity and excellent abrasion and impact resistance. The Higun range of low cement gunning mixes are designed to be installed with conventional gunning equipment and the Higun gunning nozzle. Higun combines the superior physical properties of a low cement castable with the practical advantages of a gunning material.
> Application:
> Cement Plant: Lower Precalciner/Riser, Lower Preheater/Riser, Feed Chute/Slope

### 8. Thermal Ceramics Tri-Mor Higun 60 SIC

- PRODUCT NAME: Thermal Ceramics Tri-Mor Higun 60 SIC
- CATEGORY: REFRACTORY PRODUCTS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 40

Source description/application evidence:

> A 1450°C grade, low cement gunning material exhibiting high strengths at all temperatures, low porosity and excellent abrasion and impact resistance. Contains 60% SiC for increased thermal conductivity, slag and alkali resistance. The Higun range of low cement gun mixes are designed to be installed with conventional gunning equipment and the Higun gunning nozzle. Higun combines the superior physical properties of a low cement castable with the practical advantages of a gunning material.
> Application:
> Cement Plant: Lower Precalciner/Riser, Lower Preheater/Riser, Feed Chute/Slope

### 9. Thermal Ceramics Tri-Mor Higun 160

- PRODUCT NAME: Thermal Ceramics Tri-Mor Higun 160
- CATEGORY: REFRACTORY PRODUCTS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 44

Source description/application evidence:

> A 1600°C grade, low iron, low cement gunning material exhibiting high strenghts at all temperatures, low porosity and excellent abrasion and impact resistance. The Higun range of low cement gun mixes are designed to be installed with conventional gunning equipement and the Higun gunning nozzle. Higun combines the superior physical properties of a low cement castable with the practical adavantages of a gunning material.
> Application:
> Cement Plant: Cyclones, Lower Precalciner/Riser, Lower Preheater/Riser, Feed Chute/Slope, Feed Cone, Chain Section, Lifter, Tertiary Airduct, Firing Hood, Nose Ring, Cooler, Bull Nose
> Power Plant (CFB): Combustor, Cyclone Separator, Cyclone Discharge
> Steel Plant: Skids/Beams

### 10. Thermal Ceramics Tri-Mor Higun 170

- PRODUCT NAME: Thermal Ceramics Tri-Mor Higun 170
- CATEGORY: REFRACTORY PRODUCTS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 50

Source description/application evidence:

> A 1700°C grade, low cement gunning material exhibiting high strengths at all temperatures, low porosity and excellent abrasion and impact resistance. The Higun range of low cement gunning mixes are designed to be installed with conventional gunning equipement and the Higun gunning nozzle. Higun combines superior physical properties of a low cement castables with the practical advantages of a gunning material.
> Application:
> Cement Plant: Cyclones, Lower Precalciner/Riser, Lower Preheater/Riser, Feed Chute/Slope, Feed Cone, Chain Section, Lifter, Tertiary Airduct, Firing Hood, Nose Ring, Cooler, Bull Nose

### 11. Thermal Ceramics Tri-Mor Kaolite 2800

- PRODUCT NAME: Thermal Ceramics Tri-Mor Kaolite 2800
- CATEGORY: REFRACTORY PRODUCTS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES — use stated in description; Application heading is empty
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 54

Source description/application evidence:

> Kaolite 2800 is a general purpose insulating castable for use at temperatures up to 2800°F. It may be cast, gunned or trowelled in place. Conforms to
> ASTM Class S.
> Application:

### 12. Thermal Ceramics Tri-Mor Kao-Tuff 110C

- PRODUCT NAME: Thermal Ceramics Tri-Mor Kao-Tuff 110C
- CATEGORY: REFRACTORY PRODUCTS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 58

Source description/application evidence:

> Kao-Tuff 110C is a mediumweight erosion-resistant castable with excellent insulating properties.
> Application:
> Cement Plant: Cyclones, Lower Precalciner/Riser, Lower Preheater/Riser, Chain Section, Tertiary Airduct, Cooler

### 13. Thermal Ceramics Tri-Mor Kao-Tuff 110G

- PRODUCT NAME: Thermal Ceramics Tri-Mor Kao-Tuff 110G
- CATEGORY: REFRACTORY PRODUCTS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 62

Source description/application evidence:

> Kao-Tuff 110G is a mediumweight erosion-resistant castable with excellent insulating properties.
> Application:
> Cement Plant: Cyclones, Lower Precalciner/Riser, Lower Preheater/Riser, Chain Section, Tertiary Airduct, Cooler

### 14. Thermal Ceramics Tri-Mor Kao-Tuff G

- PRODUCT NAME: Thermal Ceramics Tri-Mor Kao-Tuff G
- CATEGORY: REFRACTORY PRODUCTS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 66

Source description/application evidence:

> Kao-Tuff G is an abrasion resistant castable installed by using conventional gunning techniques. Its high strength consistently produces abrasion losses below 14cm³.
> Application:
> Cement Plant: Cyclones, Lower Precalciner/Riser, Lower Preheater/Riser, Chain Section, Tertiary Airduct, Cooler

### 15. Thermal Ceramics Tri-Mor LC140

- PRODUCT NAME: Thermal Ceramics Tri-Mor LC140
- CATEGORY: REFRACTORY PRODUCTS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 70

Source description/application evidence:

> A low cement, flint clay 1400°C castable with a high strength profile at all temperatures. Suitable as a general castable for placement by vibration.
> Application:
> Steel Plant: Bogies

### 16. Thermal Ceramics Tri-Mor Midcast

- PRODUCT NAME: Thermal Ceramics Tri-Mor Midcast
- CATEGORY: REFRACTORY PRODUCTS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 74

Source description/application evidence:

> A 1500°C high alumina castable with excellent working properties, high strength and good abrasion resistance. Its superior characteristics have made this product a firm favourite in a vast range of applications worldwide.
> Application:
> Steel Plant: Roofs, Walls, Hearths/Floors, Boogies

### 17. Thermal Ceramics Tri-Mor Morflo 40 SIC

- PRODUCT NAME: Thermal Ceramics Tri-Mor Morflo 40 SIC
- CATEGORY: REFRACTORY PRODUCTS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 78

Source description/application evidence:

> A 1450°C grade silicon carbide based low cement castable with high fluidity, allowing installation of the most intricate shapes with minimum vibration. Exhibits ultra high strengths, low strengths, low porosity and excellent abrasion resistance, high alkali resistance and high thermal conductivity.
> Application:
> Cement Plant: Lower Precalciner/Riser, Lower Preheater/Riser, Feed Chute/Slope

### 18. Thermal Ceramics Tri-Mor Morflo 160

- PRODUCT NAME: Thermal Ceramics Tri-Mor Morflo 160
- CATEGORY: REFRACTORY PRODUCTS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 82

Source description/application evidence:

> A 1600°C grade, low cement castable with exceptionally high fluidity allowing installation of the most intricate shapes with minimal vibration. Exhibits ultra high strenghts, low porosity and excellent abrasion resistance for improved service life.
> Application:
> Cement Plant: Cyclones, Lower Precalciner/Riser, Lower Preheater/Riser, Feed Chute/Slope, Feed Cone, Chain Section, Lifter, Retainer Ring, Dam, Burner Pipe, Nose Ring, Cooler, Bull Nose
> Power Plant (CFB): Combustor, Ashe Return System, Cyclone Separator
> Steel Plant: Hearths/Floors, Skids/Beams

### 19. Thermal Ceramics Tri-Mor Morflo 170

- PRODUCT NAME: Thermal Ceramics Tri-Mor Morflo 170
- CATEGORY: REFRACTORY PRODUCTS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 88

Source description/application evidence:

> A 1700°C grade, low cement castable with exceptionally high fluidity allowing installation of the most intricate shapes with minimal vibration. Exhibits ultra high strengths, low porosity and excellent abrasion resistance for improved service life.
> Application
> Cement Plant: Cyclones, Lower Precalciner/Riser, Lower Preheater/Riser, Feed Chute/Slope, Feed Cone, Chain Section, Lifter, Retainer Ring, Dam, Burner Pipe, Nose Ring, Cooler, Bull Nose
> Power Plant (CFB): Combustor, Ashe Return System, Cyclone Separator
> Steel Plant: Hearths/Floors, Skids/Beams

### 20. Thermal Ceramics Tri-Mor Plascast HT

- PRODUCT NAME: Thermal Ceramics Tri-Mor Plascast HT
- CATEGORY: REFRACTORY PRODUCTS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 94

Source description/application evidence:

> A superior quality clay-bonded plastic supplied dry and installed as a castable with high installation rates, very low drying shrinkage, excellent strength and thermal shock resistance.
> Application:
> Cement Plant: Firing Hood
> Steel Plant: Roofs, Walls, Burners

### 21. Thermal Ceramics Tri-Mor Plasgun

- PRODUCT NAME: Thermal Ceramics Tri-Mor Plasgun
- CATEGORY: REFRACTORY PRODUCTS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 99

Source description/application evidence:

> A 1700°C grade clay-bonded plastic refractory, supplied dry and installed by conventional gunning onto hot or cold surfaces with very low rebound and excellent in service properties. Also suitable for trowelling.
> Application:
> Cement Plant: Firing Hood
> Steel Plant: Roofs, Walls, Burners

### 22. MegaFlow P

- PRODUCT NAME: MegaFlow P
- CATEGORY: CONSTRUCTION CHEMICALS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 105

Source description/application evidence:

> Water reducing concrete admixture
> Used to produce pumpable, cohesive concrete in both ready-mix as well as site batched concrete.

### 23. MegaFlow P4

- PRODUCT NAME: MegaFlow P4
- CATEGORY: CONSTRUCTION CHEMICALS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 107

Source description/application evidence:

> Water reducing and set retarding admixture
> Used to produce easily workable and cohesive concrete for buildings, tunnels, runways, canals, reservoirs, etc. through RMC or site mix process.

### 24. MegaFlow P401

- PRODUCT NAME: MegaFlow P401
- CATEGORY: CONSTRUCTION CHEMICALS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 109

Source description/application evidence:

> Water reducing and set retarding admixture
> Used to produce easily workable and cohesive concrete for buildings, tunnels, runways, canals, reservoirs, etc. through RMC or site mix process.

### 25. MegaFlow SP4

- PRODUCT NAME: MegaFlow SP4
- CATEGORY: CONSTRUCTION CHEMICALS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 111

Source description/application evidence:

> High range water reducing and set retarding concrete admixture
> Recommended for large concrete pours where higher slump retention at low water to cement ratio is needed like high rise buildings, foundations, tunnel linings, dams, highways, etc.

### 26. MegaFlow SP401

- PRODUCT NAME: MegaFlow SP401
- CATEGORY: CONSTRUCTION CHEMICALS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 113

Source description/application evidence:

> Superplasticiser for extended concrete workability
> Recommended for large concrete pours where higher slump retention at low water to cement ratio is needed like high rise buildings, foundations, tunnel linings, dams, highways, etc.

### 27. MegaFlow SP402

- PRODUCT NAME: MegaFlow SP402
- CATEGORY: CONSTRUCTION CHEMICALS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 115

Source description/application evidence:

> Superplasticiser for extended concrete workability
> Recommended for easily pumpable concrete containing GGBS, fly ash, micro silica, etc. for piling, high rise structures, hot weather concreting, etc. where extended slump retention properties are required.

### 28. MegaFlow SP403

- PRODUCT NAME: MegaFlow SP403
- CATEGORY: CONSTRUCTION CHEMICALS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 117

Source description/application evidence:

> Superplasticiser for extended concrete workability
> Recommended for concrete designed with durability criteria, containing GGBS, micro silica, fly ash, etc. and low water to binder ratios for piling, high rise structures, hot weather concreting, etc. where extended slump retention properties are required.It is extremely useful in mass concrete with temperature control for raft foundations, etc.

### 29. MegaFlow SP404

- PRODUCT NAME: MegaFlow SP404
- CATEGORY: CONSTRUCTION CHEMICALS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 119

Source description/application evidence:

> High performance superplasticiser
> Recommended for concrete designed with durability criteria, containing GGBS, micro silica, fly ash, etc. and low water to binder ratios for piling, high rise structures, hot weather concreting, etc. where extended slump retention properties are required.It is extremely useful in mass concrete with temperature control for raft foundations, etc.

### 30. MegaFlow SP1

- PRODUCT NAME: MegaFlow SP1
- CATEGORY: CONSTRUCTION CHEMICALS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 121

Source description/application evidence:

> High range water reducing super plasticiser
> Used to produce pumpable concrete for slabs, foundations, beams, columns, precast elements, etc.

### 31. MegaFlow SP102

- PRODUCT NAME: MegaFlow SP102
- CATEGORY: CONSTRUCTION CHEMICALS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 123

Source description/application evidence:

> High range water reducing super plasticiser
> Used to produce concrete for precast and ready-mix concrete having high range of water reducing and high early strength requirements.

### 32. MegaFlow SP103

- PRODUCT NAME: MegaFlow SP103
- CATEGORY: CONSTRUCTION CHEMICALS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 125

Source description/application evidence:

> Strength accelerating super plasticiser
> Can be used to produce high slump concrete for the precast industries, prestressed concrete and other types of concrete elements like beams, columns, slabs, etc.

### 33. MegaFlow SP104 MF

- PRODUCT NAME: MegaFlow SP104 MF
- CATEGORY: CONSTRUCTION CHEMICALS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 127

Source description/application evidence:

> Melamine based superplasticiser
> Used to produce flowing, self compacting concrete with high early strength particularly in precast industry, GRC, coloured concrete, artificial stones, etc.

### 34. MegaFlow 1000

- PRODUCT NAME: MegaFlow 1000
- CATEGORY: CONSTRUCTION CHEMICALS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 129

Source description/application evidence:

> Polycarboxylated superplasticiser
> Used in self compacting concrete, high strength concrete, durable concrete containing GGBS, micro silica, fly ash, etc. It is used in ready-mix concrete where extra ordinary slump retention is required in hot weather conditions. Extremely useful in high fines concrete.

### 35. MegaFlow 2000

- PRODUCT NAME: MegaFlow 2000
- CATEGORY: CONSTRUCTION CHEMICALS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 131

Source description/application evidence:

> Polycarboxylated high range superplasticiser
> Used for ready-mix concrete, self compacting concrete, under water concrete, precast concrete, concrete containing silica fume, GGBS, PFA with extremely low w/c ratio, etc. It is especially useful for ultra high strength concrete, high fines concrete, hot weather concrete, etc.

### 36. MegaFlow 3000

- PRODUCT NAME: MegaFlow 3000
- CATEGORY: CONSTRUCTION CHEMICALS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 133

Source description/application evidence:

> Polycarboxylated superplasticiser for precast
> Used for ready-mix concrete, self compacting concrete, under water concrete, precast concrete, concrete containing silica fume, GGBS, PFA with extremely low w/c ratio, etc. It is especially useful for ultra high early & ultimate strength concrete, high fines concrete, cold weather concrete, etc.

### 37. MegaAdd VE

- PRODUCT NAME: MegaAdd VE
- CATEGORY: CONSTRUCTION CHEMICALS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 135

Source description/application evidence:

> Viscosity enhancing concrete admixture
> Used to improve the rheology of self compacting concrete, to arrest the bleeding from pumpable concrete, used in underwater concreting, to improve the performance of concrete which contains inadequate quantity of fines, etc.

### 38. MegaFlow R

- PRODUCT NAME: MegaFlow R
- CATEGORY: CONSTRUCTION CHEMICALS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 137

Source description/application evidence:

> Mortar and concrete set retarding admixture
> Used to produce plasters, renders, mortars & concrete for tunnels, runways, canals, reservoirs and marine structures, etc.

### 39. Mega Air

- PRODUCT NAME: Mega Air
- CATEGORY: CONSTRUCTION CHEMICALS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 139

Source description/application evidence:

> Air entraining concrete and mortar admixture
> It is used to produce concrete/mortars resistant to attack by frost and deicing salts, light weight foam concrete, etc.

### 40. MegaAdd WL1

- PRODUCT NAME: MegaAdd WL1
- CATEGORY: CONSTRUCTION CHEMICALS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 141

Source description/application evidence:

> Integral waterproofing liquid admixture
> Used to waterproof concrete structures such as reservoirs, tunnels, culverts, water tanks, swimming pools and other areas where waterproofed concrete or mortar is required.

### 41. MegaAdd WL2

- PRODUCT NAME: MegaAdd WL2
- CATEGORY: CONSTRUCTION CHEMICALS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 143

Source description/application evidence:

> Integral water repellent admixture
> Suitable for use in ready-mixed concrete and all types of structural concrete like pile foundations, water retaining structures, rafts, swimming pools, basement concrete elements, concrete exposed to seawater and rainwater, etc.

### 42. MegaAdd WL3

- PRODUCT NAME: MegaAdd WL3
- CATEGORY: CONSTRUCTION CHEMICALS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 145

Source description/application evidence:

> Durability enhancing & waterproofing admixture
> Used for water tight concrete with corrosion protection for basements, water tanks, roofs, reservoirs, dams, waste water plants, swimming pools, water treatments plants, tunnel, pile foundation, retaining walls, etc.

### 43. MegaAdd WP

- PRODUCT NAME: MegaAdd WP
- CATEGORY: CONSTRUCTION CHEMICALS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 147

Source description/application evidence:

> Integral waterproofing powder admixture
> Used for water tight concrete with corrosion protection for basements, water tanks, roofs, reservoirs, dams, waste water plants, swimming pools, water treatments plants, tunnel, pile foundation, retaining walls, etc.

### 44. MegaAdd CI

- PRODUCT NAME: MegaAdd CI
- CATEGORY: CONSTRUCTION CHEMICALS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 149

Source description/application evidence:

> Corrosion inhibiting admixture
> Used as corrosion inhibitor in concrete for piling, marine structures, structures to be treated with deicing salts, areas with high chloride contents, etc.

### 45. MegFlow PB

- PRODUCT NAME: MegFlow PB
- CATEGORY: CONSTRUCTION CHEMICALS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 151

Source description/application evidence:

> Plasticiser for paver & masonry blocks
> Used with semi dry mortar mixes of blocks and interlocking tiles,paving slabs and bricks in the precast industry, etc.

### 46. MegaFlow MP

- PRODUCT NAME: MegaFlow MP
- CATEGORY: CONSTRUCTION CHEMICALS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 153

Source description/application evidence:

> Mortar plasticiser
> Used as additive in mortars of block work, brick work, cement – sand render, plaster, etc.

### 47. MegaAdd SAL

- PRODUCT NAME: MegaAdd SAL
- CATEGORY: CONSTRUCTION CHEMICALS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 155

Source description/application evidence:

> Set accelerating liquid admixture
> Used as an additive in mixes to enable rapid setting of sprayed concrete and gunite for tunnel lining, water bodies, dams, swimming pools, basement retaining walls, concrete repairs, etc.

### 48. MegaAdd SAP

- PRODUCT NAME: MegaAdd SAP
- CATEGORY: CONSTRUCTION CHEMICALS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 157

Source description/application evidence:

> Set accelerating powder admixture
> Used as an additive in cementitious mixes to enable rapid setting of sprayed concrete and gunite for tunnel lining, water bodies, dams, swimming pools, basement retaining walls, concrete repairs, etc.

### 49. MegaAdd P4 (Powder)

- PRODUCT NAME: MegaAdd P4 (Powder)
- CATEGORY: CONSTRUCTION CHEMICALS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 159

Source description/application evidence:

> Set retarding powder admixture
> It is used to produce workable and dense concrete for use in construction of tunnels, runways, canals, dams, reservoirs, marine structures and in the manufacture of ready mix concrete, etc.

### 50. MegaAdd SP1(Powder)

- PRODUCT NAME: MegaAdd SP1(Powder)
- CATEGORY: CONSTRUCTION CHEMICALS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 161

Source description/application evidence:

> Water reducing high performance superplasticizer
> Used to produce pumpable concrete for slabs, foundations, beams, columns, precast elements, etc.

### 51. MegaAdd SP4 (Powder)

- PRODUCT NAME: MegaAdd SP4 (Powder)
- CATEGORY: CONSTRUCTION CHEMICALS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 163

Source description/application evidence:

> Water reducing and set retarding superplasticizer
> Used in tunnel linings, dams, power plants, highways. ports and other large projects where high performance concrete is required.

### 52. TOMAHAWK EC

- PRODUCT NAME: TOMAHAWK EC
- CATEGORY: WOOD PRESERVATIVE PRODUCTS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 166; identical duplicate at 168

Source description/application evidence:

> a Permethrin-based, emulsifiable, wood preservative concentrate with the same tried and proven wood preservative formulation for the effective and economical protection of wood products, handicrafts and other cellulosic materials against damage by wood-boring insects. Treated wood can be glued, polished, painted over, varnished over and treated with external wood stains.

### 53. TOMAHAWK DELTAM EC

- PRODUCT NAME: TOMAHAWK DELTAM EC
- CATEGORY: WOOD PRESERVATIVE PRODUCTS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 170

Source description/application evidence:

> a Deltamethrin-based, emulsifiable wood preservative concentrate suitable for the treatment of all types of new and existing wood out of ground contact such as furniture, timbers, pallets, crates and other wood products that can be applied with a durable surface coating afterwards.

### 54. SPIK ‘N SPAN

- PRODUCT NAME: SPIK ‘N SPAN
- CATEGORY: WOOD PRESERVATIVE PRODUCTS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 172

Source description/application evidence:

> an emulsifiable concentrate fungicide specially formulated to contain proven and tested active ingredients that provide excellent protection to wood, bamboo and rattan products against attack by a wide range of molds and fungi. This product penetrates deep into the wood grains and remains there as an active barrier that inhibits the growth of molds, slime, staining fungi and wood rot.

### 55. QEMI DF 210FG

- PRODUCT NAME: QEMI DF 210FG
- CATEGORY: INDUSTRIAL CHEMICALS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 175

Source description/application evidence:

> 10% Silicone Antifoam Emulsion, Water-
> Based, Food-Grade, Kosher

### 56. QEMI DF 220FG

- PRODUCT NAME: QEMI DF 220FG
- CATEGORY: INDUSTRIAL CHEMICALS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 178

Source description/application evidence:

> 20% Silicone Antifoam Emulsion, Water-
> Based, Food-Grade, Kosher

### 57. QEMI DF 1000KFG

- PRODUCT NAME: QEMI DF 1000KFG
- CATEGORY: INDUSTRIAL CHEMICALS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 181

Source description/application evidence:

> 100% Silicone Antifoam Emulsion, Water-
> Based, Food-Grade, Kosher

### 58. QEMI DF 8402

- PRODUCT NAME: QEMI DF 8402
- CATEGORY: INDUSTRIAL CHEMICALS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: NO — composition/grade only
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 184

Source description/application evidence:

> Vegetable Oil-Based (Food-Grade,
> Kosher, Non-Silicone)

### 59. QEMI DF 8062

- PRODUCT NAME: QEMI DF 8062
- CATEGORY: INDUSTRIAL CHEMICALS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 187

Source description/application evidence:

> Water-Based Defoamer (Food-Grade, Kosher, Non-Silicone)

### 60. QEMI DF 8112

- PRODUCT NAME: QEMI DF 8112
- CATEGORY: INDUSTRIAL CHEMICALS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 189

Source description/application evidence:

> Powdered Antifoam Containing Silicone,
> Food-Grade, Kosher

### 61. QEMI DF 8278

- PRODUCT NAME: QEMI DF 8278
- CATEGORY: INDUSTRIAL CHEMICALS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 192

Source description/application evidence:

> Silicone Antifoam Emulsion, Water-
> Based, Food-Grade, Kosher

### 62. QEMI DF 8280

- PRODUCT NAME: QEMI DF 8280
- CATEGORY: INDUSTRIAL CHEMICALS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 195

Source description/application evidence:

> A Non-Aqueous, 100% Active, Food-
> Grade, Kosher Defoaming Liquid

### 63. QEMI DF SF8350

- PRODUCT NAME: QEMI DF SF8350
- CATEGORY: INDUSTRIAL CHEMICALS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: NO — composition/grade only
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 198

Source description/application evidence:

> Silicone Fluid, Polydimethylsiloxane,
> Trimethylsiloxy Terminated, Food-Grade

### 64. QEMI DF 230 FG

- PRODUCT NAME: QEMI DF 230 FG
- CATEGORY: INDUSTRIAL CHEMICALS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 201

Source description/application evidence:

> 30% Silicone Antifoam Emulsion, Water-
> Based, Food-Grade, Kosher

### 65. QEMI DF 8400T

- PRODUCT NAME: QEMI DF 8400T
- CATEGORY: INDUSTRIAL CHEMICALS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: NO — composition/grade only
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 204

Source description/application evidence:

> Vegetable Oil-Based (Food-Grade,
> Kosher, Non-Silicone)

### 66. QEMI DF 8227

- PRODUCT NAME: QEMI DF 8227
- CATEGORY: INDUSTRIAL CHEMICALS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: NO — composition/grade only
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 207

Source description/application evidence:

> Water-Based Mineral Oil Emulsion (Food-
> Grade, Kosher, Non-Silicone)

### 67. QEMI DF 8031

- PRODUCT NAME: QEMI DF 8031
- CATEGORY: INDUSTRIAL CHEMICALS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: NO — composition/grade only
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 210

Source description/application evidence:

> Mineral Oil-Based (Food-Grade, Kosher, Non-Silicone)

### 68. QEMI DF 8032

- PRODUCT NAME: QEMI DF 8032
- CATEGORY: INDUSTRIAL CHEMICALS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: NO — composition/grade only
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 212

Source description/application evidence:

> Mineral Oil-Based (Food-Grade, Kosher, Non-Silicone)

### 69. QEMIDESCAL 977

- PRODUCT NAME: QEMIDESCAL 977
- CATEGORY: INDUSTRIAL CHEMICALS
- UNIT: NOT PROVIDED
- COST PRICE: NOT PROVIDED
- SELLING PRICE: NOT PROVIDED
- REORDER LEVEL: NOT PROVIDED
- BRAND: NOT EXPLICITLY IDENTIFIED — leave unset
- DESCRIPTION AVAILABLE IN DOCUMENT: YES
- APPLICATION AVAILABLE IN DOCUMENT: YES
- EXISTING PRODUCT MATCH: NO
- MISSING REQUIRED FIELDS: Unit; Cost Price; Selling Price; Reorder Level
- ACTION: REQUIRES CLIENT INPUT
- REASON: The four required business values are absent; application defaults cannot substitute for client-confirmed values.
- DESCRIPTION/APPLICATION HANDLING: NOT IMPORTED — NO EXISTING PRODUCT CATALOG FIELD
- SOURCE LINE: 214

Source description/application evidence:

> A biodegradable, medium-duty surface degreaser/cleaner ideal for industrial and commercial facilities, institutions and even households. It quickly removes oil, grease, grime, dirt and other contaminants on all surface types and components.  This degrease is the most versatile and strongest, non-solvent based product in the marketA

## Phase 1 verification

- Product records created: 0
- Procurement/replenishment requests, purchase orders/items, suppliers: 0 records created
- Receivings/items/timelines and QA inspections/items: 0 records created
- Inventory, inventory movements, stock-in and stock-out: 0 records created
- Orders/items/status histories, shipments and logistics: 0 records created
- Barcode, forecast, and other operational records: 0 records created
- Existing business data updated/deleted: none
- Application code, configuration, schema, constraints, and relationships changed: none
- Existing product-selection/reference relationships preserved: YES, unchanged

Only this review document was written. No creation endpoint, migration, seeder, operational workflow, or database write query was executed. Stop after Phase 1 and await explicit Phase 2 approval.
