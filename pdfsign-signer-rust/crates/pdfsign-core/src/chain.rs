//! Build the CA chain to embed in a signature.
//!
//! Vietnamese CA tokens usually hold only the end-entity certificate, and many CA certificates
//! carry no caIssuers AIA. The issuer therefore has to come from a local pool (the token, the OS
//! certificate store). Several CA certificates can share one subject name (re-keyed or renewed
//! CAs such as two "EASYCA" certificates), so an issuer is accepted only when its key verifies
//! the child's signature; name + key identifier is a fallback for keys we cannot verify.

use crate::cades::parse_certificate;
use crate::verify::cert_issued_by;
use const_oid::ObjectIdentifier;
use der::Decode;
use std::time::Duration;
use x509_cert::ext::pkix::{AuthorityKeyIdentifier, SubjectKeyIdentifier};
use x509_cert::Certificate;

const OID_SKI: ObjectIdentifier = ObjectIdentifier::new_unwrap("2.5.29.14");
const OID_AKI: ObjectIdentifier = ObjectIdentifier::new_unwrap("2.5.29.35");
const MAX_DEPTH: usize = 8;

fn ext(c: &Certificate, oid: ObjectIdentifier) -> Option<&[u8]> {
    c.tbs_certificate
        .extensions
        .iter()
        .flatten()
        .find(|e| e.extn_id == oid)
        .map(|e| e.extn_value.as_bytes())
}

fn ski(c: &Certificate) -> Option<Vec<u8>> {
    SubjectKeyIdentifier::from_der(ext(c, OID_SKI)?)
        .ok()
        .map(|k| k.0.as_bytes().to_vec())
}

fn aki(c: &Certificate) -> Option<Vec<u8>> {
    AuthorityKeyIdentifier::from_der(ext(c, OID_AKI)?)
        .ok()?
        .key_identifier
        .map(|k| k.as_bytes().to_vec())
}

fn not_before(c: &Certificate) -> Duration {
    c.tbs_certificate.validity.not_before.to_unix_duration()
}

fn not_after(c: &Certificate) -> Duration {
    c.tbs_certificate.validity.not_after.to_unix_duration()
}

fn is_self_signed(c: &Certificate) -> bool {
    c.tbs_certificate.subject == c.tbs_certificate.issuer
}

/// Name + key identifier match, for issuers whose signature we cannot check (e.g. non-RSA).
fn key_id_match(child: &Certificate, issuer: &Certificate) -> bool {
    child.tbs_certificate.issuer == issuer.tbs_certificate.subject
        && matches!((aki(child), ski(issuer)), (Some(a), Some(s)) if a == s)
}

/// Pick the issuer of `child` from `pool`. Among verified candidates prefer the one valid when
/// `child` was issued, then the one that expires last.
fn find_issuer<'a>(
    child: &Certificate,
    pool: &'a [(Vec<u8>, Certificate)],
) -> Option<&'a (Vec<u8>, Certificate)> {
    let rank = |c: &Certificate| {
        let covers = not_before(c) <= not_before(child) && not_before(child) <= not_after(c);
        (covers, not_after(c))
    };
    let named: Vec<_> = pool
        .iter()
        .filter(|(_, c)| c.tbs_certificate.subject == child.tbs_certificate.issuer)
        .collect();
    named
        .iter()
        .filter(|(_, c)| cert_issued_by(child, c))
        .max_by_key(|(_, c)| rank(c))
        .or_else(|| {
            named
                .iter()
                .filter(|(_, c)| key_id_match(child, c))
                .max_by_key(|(_, c)| rank(c))
        })
        .copied()
}

/// CA certificates (DER) from `leaf_der`'s issuer up to the root, found in `pool`.
/// The leaf itself is not included; the self-signed root is included when present.
/// Stops quietly at the first missing link.
pub fn complete_chain(leaf_der: &[u8], pool: &[Vec<u8>]) -> Vec<Vec<u8>> {
    let Ok(mut current) = parse_certificate(leaf_der) else {
        return Vec::new();
    };
    let parsed: Vec<(Vec<u8>, Certificate)> = pool
        .iter()
        .filter(|d| d.as_slice() != leaf_der)
        .filter_map(|d| parse_certificate(d).ok().map(|c| (d.clone(), c)))
        .collect();
    let mut chain: Vec<Vec<u8>> = Vec::new();
    for _ in 0..MAX_DEPTH {
        if is_self_signed(&current) {
            break;
        }
        let Some((der, cert)) = find_issuer(&current, &parsed) else {
            break;
        };
        if chain.contains(der) {
            break;
        }
        chain.push(der.clone());
        current = cert.clone();
    }
    chain
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn garbage_leaf_gives_empty_chain() {
        assert!(complete_chain(b"not a cert", &[b"x".to_vec()]).is_empty());
    }
}
