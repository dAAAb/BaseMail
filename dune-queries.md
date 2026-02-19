# BaseMail Attention Bonds — Dune Dashboard Queries

**Contract:** `0xF5fB1bb79D466bbd6F7588Fe57B67C675844C220` (Base Mainnet)

## Event Topic0 Hashes
- BondDeposited: `0x46e4756f3964bc66ee7f8bfefe755d1260b8e97a11503d05e93fe23e540bbfca`
- BondRefunded: `0xb34b453fe0dbed79135a2bd8c19a0172be613a03f176691c7294a2eb89934c55`
- BondForfeited: `0x23a217583c5b4b6fc4298ac7f234eb55c4d3d409a7fdf42232d0d7eb0e0a562e`
- AttentionPriceSet: `0x1621101222b1172372555c6ce4c616cd5758dc233c29572971069bed04e4ac19`

---

## Query 1: Overview — Total Bonds Summary

```sql
SELECT
    COUNT(*) FILTER (WHERE topic0 = 0x46e4756f3964bc66ee7f8bfefe755d1260b8e97a11503d05e93fe23e540bbfca) AS total_deposits,
    COUNT(*) FILTER (WHERE topic0 = 0xb34b453fe0dbed79135a2bd8c19a0172be613a03f176691c7294a2eb89934c55) AS total_refunds,
    COUNT(*) FILTER (WHERE topic0 = 0x23a217583c5b4b6fc4298ac7f234eb55c4d3d409a7fdf42232d0d7eb0e0a562e) AS total_forfeits,
    SUM(CASE 
        WHEN topic0 = 0x46e4756f3964bc66ee7f8bfefe755d1260b8e97a11503d05e93fe23e540bbfca 
        THEN bytearray_to_uint256(bytearray_substring(data, 1, 32)) / 1e6
        ELSE 0 
    END) AS total_usdc_deposited
FROM base.logs
WHERE contract_address = 0xF5fB1bb79D466bbd6F7588Fe57B67C675844C220
```

## Query 2: All Bond Events (Timeline)

```sql
SELECT
    block_time,
    tx_hash,
    CASE topic0
        WHEN 0x46e4756f3964bc66ee7f8bfefe755d1260b8e97a11503d05e93fe23e540bbfca THEN 'Deposit'
        WHEN 0xb34b453fe0dbed79135a2bd8c19a0172be613a03f176691c7294a2eb89934c55 THEN 'Refund'
        WHEN 0x23a217583c5b4b6fc4298ac7f234eb55c4d3d409a7fdf42232d0d7eb0e0a562e THEN 'Forfeit'
        WHEN 0x1621101222b1172372555c6ce4c616cd5758dc233c29572971069bed04e4ac19 THEN 'PriceSet'
        ELSE 'Other'
    END AS event_type,
    bytearray_to_uint256(bytearray_substring(data, 1, 32)) / 1e6 AS amount_usdc,
    topic2 AS sender,
    topic3 AS recipient
FROM base.logs
WHERE contract_address = 0xF5fB1bb79D466bbd6F7588Fe57B67C675844C220
    AND topic0 IN (
        0x46e4756f3964bc66ee7f8bfefe755d1260b8e97a11503d05e93fe23e540bbfca,
        0xb34b453fe0dbed79135a2bd8c19a0172be613a03f176691c7294a2eb89934c55,
        0x23a217583c5b4b6fc4298ac7f234eb55c4d3d409a7fdf42232d0d7eb0e0a562e,
        0x1621101222b1172372555c6ce4c616cd5758dc233c29572971069bed04e4ac19
    )
ORDER BY block_time DESC
```

## Query 3: Daily Bond Volume

```sql
SELECT
    date_trunc('day', block_time) AS day,
    COUNT(*) AS bond_count,
    SUM(bytearray_to_uint256(bytearray_substring(data, 1, 32)) / 1e6) AS usdc_volume
FROM base.logs
WHERE contract_address = 0xF5fB1bb79D466bbd6F7588Fe57B67C675844C220
    AND topic0 = 0x46e4756f3964bc66ee7f8bfefe755d1260b8e97a11503d05e93fe23e540bbfca
GROUP BY 1
ORDER BY 1
```

## Query 4: Unique Senders & Recipients

```sql
SELECT
    COUNT(DISTINCT topic2) AS unique_senders,
    COUNT(DISTINCT topic3) AS unique_recipients,
    COUNT(DISTINCT topic1) AS unique_emails
FROM base.logs
WHERE contract_address = 0xF5fB1bb79D466bbd6F7588Fe57B67C675844C220
    AND topic0 = 0x46e4756f3964bc66ee7f8bfefe755d1260b8e97a11503d05e93fe23e540bbfca
```

## Query 5: Bond Outcomes (Pie Chart)

```sql
SELECT
    CASE topic0
        WHEN 0xb34b453fe0dbed79135a2bd8c19a0172be613a03f176691c7294a2eb89934c55 THEN 'Refunded (Replied)'
        WHEN 0x23a217583c5b4b6fc4298ac7f234eb55c4d3d409a7fdf42232d0d7eb0e0a562e THEN 'Forfeited (Ignored)'
    END AS outcome,
    COUNT(*) AS count,
    SUM(bytearray_to_uint256(bytearray_substring(data, 1, 32)) / 1e6) AS usdc_amount
FROM base.logs
WHERE contract_address = 0xF5fB1bb79D466bbd6F7588Fe57B67C675844C220
    AND topic0 IN (
        0xb34b453fe0dbed79135a2bd8c19a0172be613a03f176691c7294a2eb89934c55,
        0x23a217583c5b4b6fc4298ac7f234eb55c4d3d409a7fdf42232d0d7eb0e0a562e
    )
GROUP BY 1
```
