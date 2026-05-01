# Defensa en inglés - Formulario Oficial y Dashboard Comparativo

## Short explanation

My responsibility was to develop the official form and the comparative dashboard.

The official form validates electoral records before sending them to the official PostgreSQL backend. It checks required fields, integer values, negative numbers, duplicated records, total votes, blank votes, null votes, and enabled voters.

The comparative dashboard compares preliminary RRV data with official count data. RRV data is expected to come from MongoDB, while official data is expected to come from PostgreSQL. The dashboard shows differences by candidate, total votes, inconsistencies, participation indicators, audit information, and technical observations.

## About technical observations

The module can display technical observations such as flattened PDFs, cropped PDFs, format changes, duplicated records, or changes between blank and null votes. However, this frontend does not process or flatten PDF files. That information must come from the RRV/OCR pipeline or from the official data source.

## Full answer

My module is focused on the official count interface and the analytical comparison between the preliminary and official results. The form is designed to prevent invalid official records from being saved without visual validation. If the record has warnings or technical notes, it is shown as observed. If it has critical arithmetic errors, it is shown as rejected.

The dashboard compares RRV and official results using a common act identifier. It calculates differences field by field and highlights critical inconsistencies. This helps improve transparency because users can see where the preliminary count and the official count do not match.

## Important phrase

This module does not implement the databases directly. It consumes the PostgreSQL official backend and the MongoDB RRV data through APIs provided by the other modules.
