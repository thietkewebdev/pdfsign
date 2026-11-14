//! PAdES B-LT / B-LTA: gather validation data (chain via AIA, OCSP, CRL) and embed it in a
//! Document Security Store (DSS), then optionally add a document timestamp.

use crate::appearance::{flate_stream, ObjAlloc};
use crate::cades::{parse_certificate, Timestamper, OID_SIGNATURE_TIME_STAMP_TOKEN};
use crate::error::{Error, Result};
use crate::sign::{append_update, prepare, SignOptions, SignatureKind};
use cms::cert::CertificateChoices;
use cms::content_info::ContentInfo;
use cms::signed_data::SignedData;
use const_oid::ObjectIdentifier;
use der::asn1::OctetString;
use der::{Decode, Encode, SliceReader};
use lopdf::{Dictionary, Document, Object, ObjectId, StringFormat};
use sha1::{Digest, Sha1};
use std::collections::BTreeMap;
use x509_cert::ext::pkix::name::GeneralName;
use x509_cert::ext::pkix::{AuthorityInfoAccessSyntax, CrlDistributionPoints};
use x509_cert::Certificate;
use x509_ocsp::{
    BasicOcspResponse, CertId, CertStatus, OcspRequest, OcspResponse, OcspResponseStatus, Request,
    TbsRequest, Version,
};

const OID_AIA: ObjectIdentifier = ObjectIdentifier::new_unwrap("1.3.6.1.5.5.7.1.1");
const OID_AD_OCSP: ObjectIdentifier = ObjectIdentifier::new_unwrap("1.3.6.1.5.5.7.48.1");
const OID_AD_CA_ISSUERS: ObjectIdentifier = ObjectIdentifier::new_unwrap("1.3.6.1.5.5.7.48.2");
const OID_CRL_DP: ObjectIdentifier = ObjectIdentifier::new_unwrap("2.5.29.31");
const OID_OCSP_NOCHECK: ObjectIdentifier = ObjectIdentifier::new_unwrap("1.3.6.1.5.5.7.48.1.5");
const OID_SHA1: ObjectIdentifier = ObjectIdentifier::new_unwrap("1.3.14.3.2.26");

/// Minimal HTTP client used for AIA, OCSP and CRL fetching.
pub trait Http {
    fn get(&self, url: &str) -> Result<Vec<u8>>;
    fn post(&self, url: &str, content_type: &str, body: &[u8]) -> Result<Vec<u8>>;
}

#[cfg(feature = "tsa")]
pub struct UreqHttp {
    agent: ureq::Agent,
}

#[cfg(feature = "tsa")]
impl Default for UreqHttp {
    fn default() -> Self {
        let agent = ureq::Agent::config_builder()
            .timeout_global(Some(std::time::Duration::from_secs(20)))
            .build()
            .into();
        Self { agent }
    }
}

#[cfg(feature = "tsa")]
impl Http for UreqHttp {
    fn get(&self, url: &str) -> Result<Vec<u8>> {
        let mut r = self.agent.get(url).call().map_err(|e| Error::Ltv(format!("GET {url}: {e}")))?;
        r.body_mut()
            .with_config()
            .limit(20 * 1024 * 1024)
            .read_to_vec()
            .map_err(|e| Error::Ltv(format!("GET {url}: {e}")))
    }

    fn post(&self, url: &str, content_type: &str, body: &[u8]) -> Result<Vec<u8>> {
        let mut r = self
            .agent
            .post(url)
            .header("Content-Type", content_type)
            .send(body)
            .map_err(|e| Error::Ltv(format!("POST {url}: {e}")))?;
        r.body_mut()
            .with_config()
            .limit(5 * 1024 * 1024)
            .read_to_vec()
            .map_err(|e| Error::Ltv(format!("POST {url}: {e}")))
    }
}

/// Validation material for the DSS.
#[derive(Debug, Clone, Default)]
pub struct ValidationData {
    pub certs: Vec<Vec<u8>>,
    pub ocsps: Vec<Vec<u8>>,
    pub crls: Vec<Vec<u8>>,
    /// Human-readable problems (missing issuer, unreachable responder, revoked cert, ...).
    pub warnings: Vec<String>,
    /// Subjects reported revoked by OCSP.
    pub revoked: Vec<String>,
}

impl ValidationData {
    fn push_unique(list: &mut Vec<Vec<u8>>, item: Vec<u8>) -> bool {
        if list.contains(&item) {
            false
        } else {
            list.push(item);
            true
        }
    }
}

fn subject_label(c: &Certificate) -> String {
    crate::certinfo::name_attr(&c.tbs_certificate.subject, ObjectIdentifier::new_unwrap("2.5.4.3"))
        .unwrap_or_else(|| c.tbs_certificate.subject.to_string())
}

fn is_self_signed(c: &Certificate) -> bool {
    c.tbs_certificate.subject == c.tbs_certificate.issuer
}

fn extension<'a>(c: &'a Certificate, oid: ObjectIdentifier) -> Option<&'a [u8]> {
    c.tbs_certificate
        .extensions
        .iter()
        .flatten()
        .find(|e| e.extn_id == oid)
        .map(|e| e.extn_value.as_bytes())
}

fn uri(name: &GeneralName) -> Option<String> {
    match name {
        GeneralName::UniformResourceIdentifier(u) => {
            let s = u.to_string();
            (s.starts_with("http://") || s.starts_with("https://")).then_some(s)
        }
        _ => None,
    }
}

fn aia_urls(c: &Certificate, method: ObjectIdentifier) -> Vec<String> {
    extension(c, OID_AIA)
        .and_then(|v| AuthorityInfoAccessSyntax::from_der(v).ok())
        .map(|aia| {
            aia.0
                .iter()
                .filter(|ad| ad.access_method == method)
                .filter_map(|ad| uri(&ad.access_location))
                .collect()
        })
        .unwrap_or_default()
}

fn crl_urls(c: &Certificate) -> Vec<String> {
    use x509_cert::ext::pkix::name::DistributionPointName;
    extension(c, OID_CRL_DP)
        .and_then(|v| CrlDistributionPoints::from_der(v).ok())
        .map(|dps| {
            dps.0
                .iter()
                .filter_map(|dp| match &dp.distribution_point {
                    Some(DistributionPointName::FullName(names)) => Some(names.iter().filter_map(uri).collect::<Vec<_>>()),
                    _ => None,
                })
                .flatten()
                .collect()
        })
        .unwrap_or_default()
}

/// Parse certificates from DER, PEM, or a degenerate PKCS#7 (.p7c) as served by AIA URLs.
fn parse_cert_bundle(data: &[u8]) -> Vec<Vec<u8>> {
    if let Ok(certs) = crate::soft::certs_from_pem_or_der(data) {
        let ok: Vec<_> = certs.into_iter().filter(|c| Certificate::from_der(c).is_ok()).collect();
        if !ok.is_empty() {
            return ok;
        }
    }
    let Ok(mut r) = SliceReader::new(data) else { return Vec::new() };
    let Ok(ci) = ContentInfo::decode(&mut r) else { return Vec::new() };
    let Ok(sd) = ci.content.decode_as::<SignedData>() else { return Vec::new() };
    sd.certificates
        .map(|cs| {
            cs.0.iter()
                .filter_map(|c| match c {
                    CertificateChoices::Certificate(c) => c.to_der().ok(),
                    _ => None,
                })
                .collect()
        })
        .unwrap_or_default()
}

fn ocsp_request(cert: &Certificate, issuer: &Certificate) -> Result<Vec<u8>> {
    let name_hash = Sha1::digest(cert.tbs_certificate.issuer.to_der()?);
    let key_hash = Sha1::digest(issuer.tbs_certificate.subject_public_key_info.subject_public_key.raw_bytes());
    let req = OcspRequest {
        tbs_request: TbsRequest {
            version: Version::V1,
            requestor_name: None,
            request_list: vec![Request {
                req_cert: CertId {
                    hash_algorithm: spki::AlgorithmIdentifierOwned { oid: OID_SHA1, parameters: Some(der::Any::null()) },
                    issuer_name_hash: OctetString::new(name_hash.to_vec())?,
                    issuer_key_hash: OctetString::new(key_hash.to_vec())?,
                    serial_number: cert.tbs_certificate.serial_number.clone(),
                },
                single_request_extensions: None,
            }],
            request_extensions: None,
        },
        optional_signature: None,
    };
    Ok(req.to_der()?)
}

/// Parse an OCSPResponse; returns (status for `serial`, responder certs).
pub fn parse_ocsp(resp: &[u8]) -> Result<(Vec<(Vec<u8>, CertStatus)>, Vec<Vec<u8>>)> {
    let r = OcspResponse::from_der(resp).map_err(|e| Error::Ltv(format!("OCSP: {e}")))?;
    if r.response_status != OcspResponseStatus::Successful {
        return Err(Error::Ltv(format!("OCSP status {:?}", r.response_status)));
    }
    let bytes = r.response_bytes.ok_or_else(|| Error::Ltv("OCSP: no responseBytes".into()))?;
    let basic = BasicOcspResponse::from_der(bytes.response.as_bytes()).map_err(|e| Error::Ltv(format!("OCSP basic: {e}")))?;
    let statuses = basic
        .tbs_response_data
        .responses
        .iter()
        .map(|s| (s.cert_id.serial_number.as_bytes().to_vec(), s.cert_status))
        .collect();
    let certs = basic.certs.unwrap_or_default().iter().filter_map(|c| c.to_der().ok()).collect();
    Ok((statuses, certs))
}

/// Collect chain + revocation data for `start` certificates. `pool` holds other known certs
/// (e.g. from the token or the CMS) used before falling back to AIA downloads.
pub fn collect_validation_data(start: &[Vec<u8>], pool: &[Vec<u8>], http: &dyn Http) -> ValidationData {
    let mut data = ValidationData::default();
    let mut known: Vec<Vec<u8>> = start.iter().chain(pool.iter()).cloned().collect();
    let mut queue: Vec<Vec<u8>> = start.to_vec();
    let mut done: Vec<Vec<u8>> = Vec::new();
    while let Some(der_bytes) = queue.pop() {
        if done.contains(&der_bytes) || done.len() > 32 {
            continue;
        }
        done.push(der_bytes.clone());
        let Ok(cert) = parse_certificate(&der_bytes) else { continue };
        ValidationData::push_unique(&mut data.certs, der_bytes.clone());
        if is_self_signed(&cert) {
            continue;
        }
        let label = subject_label(&cert);

        let find_issuer = |known: &[Vec<u8>]| {
            known.iter().find_map(|k| {
                let c = parse_certificate(k).ok()?;
                (c.tbs_certificate.subject == cert.tbs_certificate.issuer && *k != der_bytes).then(|| (k.clone(), c))
            })
        };
        let mut issuer = find_issuer(&known);
        if issuer.is_none() {
            for url in aia_urls(&cert, OID_AD_CA_ISSUERS) {
                match http.get(&url) {
                    Ok(body) => known.extend(parse_cert_bundle(&body)),
                    Err(e) => data.warnings.push(format!("{label}: không tải được chứng thư CA ({e})")),
                }
                issuer = find_issuer(&known);
                if issuer.is_some() {
                    break;
                }
            }
        }
        let Some((issuer_der, issuer_cert)) = issuer else {
            data.warnings.push(format!("{label}: không tìm được chứng thư CA cấp phát (AIA)"));
            continue;
        };
        queue.push(issuer_der);

        if extension(&cert, OID_OCSP_NOCHECK).is_some() {
            continue;
        }
        let mut have_revinfo = false;
        for url in aia_urls(&cert, OID_AD_OCSP) {
            let result = ocsp_request(&cert, &issuer_cert)
                .and_then(|req| http.post(&url, "application/ocsp-request", &req))
                .and_then(|resp| parse_ocsp(&resp).map(|parsed| (resp, parsed)));
            match result {
                Ok((resp, (statuses, responder_certs))) => {
                    let serial = cert.tbs_certificate.serial_number.as_bytes();
                    match statuses.iter().find(|(s, _)| s.as_slice() == serial).map(|(_, st)| st) {
                        Some(CertStatus::Good(_)) => {}
                        Some(CertStatus::Revoked(_)) => data.revoked.push(label.clone()),
                        _ => {
                            data.warnings.push(format!("{label}: OCSP trả về trạng thái không xác định"));
                            continue;
                        }
                    }
                    ValidationData::push_unique(&mut data.ocsps, resp);
                    for rc in responder_certs {
                        known.push(rc.clone());
                        queue.push(rc);
                    }
                    have_revinfo = true;
                    break;
                }
                Err(e) => data.warnings.push(format!("{label}: OCSP lỗi ({e})")),
            }
        }
        if !have_revinfo {
            for url in crl_urls(&cert) {
                match http.get(&url) {
                    Ok(crl) => {
                        ValidationData::push_unique(&mut data.crls, crl);
                        have_revinfo = true;
                        break;
                    }
                    Err(e) => data.warnings.push(format!("{label}: không tải được CRL ({e})")),
                }
            }
        }
        if !have_revinfo {
            data.warnings.push(format!("{label}: thiếu thông tin thu hồi (OCSP/CRL)"));
        }
    }
    data
}

/// All certificates embedded in a CMS signature, including those inside its signature timestamp.
pub fn certs_in_cms(cms_der: &[u8]) -> Result<Vec<Vec<u8>>> {
    let mut r = SliceReader::new(cms_der)?;
    let ci = ContentInfo::decode(&mut r)?;
    let sd: SignedData = ci.content.decode_as()?;
    let mut out = Vec::new();
    collect_signed_data_certs(&sd, &mut out);
    for si in sd.signer_infos.0.iter() {
        for attr in si.unsigned_attrs.iter().flat_map(|u| u.iter()) {
            if attr.oid == OID_SIGNATURE_TIME_STAMP_TOKEN {
                for v in attr.values.iter() {
                    if let Ok(tst) = v.decode_as::<ContentInfo>() {
                        if let Ok(tsd) = tst.content.decode_as::<SignedData>() {
                            collect_signed_data_certs(&tsd, &mut out);
                        }
                    }
                }
            }
        }
    }
    Ok(out)
}

fn collect_signed_data_certs(sd: &SignedData, out: &mut Vec<Vec<u8>>) {
    for c in sd.certificates.iter().flat_map(|cs| cs.0.iter()) {
        if let CertificateChoices::Certificate(c) = c {
            if let Ok(d) = c.to_der() {
                if !out.contains(&d) {
                    out.push(d);
                }
            }
        }
    }
}

/// /Contents (unpadded CMS) and raw /Contents bytes of every signature dictionary, in file order.
pub fn signature_contents(pdf: &[u8]) -> Result<Vec<(Vec<u8>, Vec<u8>)>> {
    let doc = Document::load_mem(pdf)?;
    let mut out = Vec::new();
    for obj in doc.objects.values() {
        let Ok(d) = obj.as_dict() else { continue };
        let is_sig = matches!(d.get(b"Type").and_then(|o| o.as_name()), Ok(b"Sig") | Ok(b"DocTimeStamp"));
        if !is_sig || !d.has(b"ByteRange") {
            continue;
        }
        let Ok(Object::String(raw, _)) = d.get(b"Contents") else { continue };
        let start = d
            .get(b"ByteRange")
            .and_then(|o| o.as_array())
            .ok()
            .and_then(|a| a.get(1).and_then(|o| o.as_i64().ok()))
            .unwrap_or(0);
        let der_len = der_total_len(raw).unwrap_or(raw.len()).min(raw.len());
        out.push((start, raw[..der_len].to_vec(), raw.clone()));
    }
    out.sort_by_key(|(start, ..)| *start);
    Ok(out.into_iter().map(|(_, a, b)| (a, b)).collect())
}

fn der_total_len(b: &[u8]) -> Option<usize> {
    if b.len() < 2 {
        return None;
    }
    let l = b[1] as usize;
    if l < 0x80 {
        return Some(2 + l);
    }
    let n = l & 0x7f;
    if n == 0 || n > 4 || b.len() < 2 + n {
        return None;
    }
    Some(2 + n + b[2..2 + n].iter().fold(0usize, |acc, x| (acc << 8) | *x as usize))
}

fn ref_array(doc: &Document, dss: &Dictionary, key: &[u8]) -> Vec<Object> {
    match dss.get(key) {
        Ok(Object::Array(a)) => a.clone(),
        Ok(Object::Reference(id)) => doc.get_object(*id).ok().and_then(|o| o.as_array().ok()).cloned().unwrap_or_default(),
        _ => Vec::new(),
    }
}

/// Append a DSS update. Existing DSS entries are kept; `vri_contents` are the raw /Contents
/// bytes of the signatures the data applies to (VRI keys = SHA-1 of those bytes).
pub fn add_dss(pdf: &[u8], data: &ValidationData, vri_contents: &[Vec<u8>]) -> Result<Vec<u8>> {
    append_update(pdf, |doc, alloc: &mut ObjAlloc, modified: &mut BTreeMap<ObjectId, Object>| {
        let root_id = doc.trailer.get(b"Root").and_then(|o| o.as_reference())?;
        let mut catalog = doc.get_dictionary(root_id)?.clone();
        let (existing_id, mut dss) = match catalog.get(b"DSS") {
            Ok(Object::Reference(id)) => (Some(*id), doc.get_dictionary(*id)?.clone()),
            Ok(Object::Dictionary(d)) => (None, d.clone()),
            _ => (None, Dictionary::new()),
        };
        let mut add_streams = |key: &str, items: &[Vec<u8>]| -> Vec<Object> {
            let mut arr = ref_array(doc, &dss, key.as_bytes());
            let mut refs = Vec::new();
            for item in items {
                let id = alloc.add(Object::Stream(flate_stream(Dictionary::new(), item)));
                arr.push(Object::Reference(id));
                refs.push(Object::Reference(id));
            }
            dss.set(key, Object::Array(arr));
            refs
        };
        let cert_refs = add_streams("Certs", &data.certs);
        let ocsp_refs = add_streams("OCSPs", &data.ocsps);
        let crl_refs = add_streams("CRLs", &data.crls);

        let mut vri = match dss.get(b"VRI") {
            Ok(Object::Dictionary(d)) => d.clone(),
            Ok(Object::Reference(id)) => doc.get_dictionary(*id)?.clone(),
            _ => Dictionary::new(),
        };
        for contents in vri_contents {
            let key = hex::encode_upper(Sha1::digest(contents));
            let mut entry = Dictionary::new();
            entry.set("Cert", Object::Array(cert_refs.clone()));
            if !ocsp_refs.is_empty() {
                entry.set("OCSP", Object::Array(ocsp_refs.clone()));
            }
            if !crl_refs.is_empty() {
                entry.set("CRL", Object::Array(crl_refs.clone()));
            }
            let now = chrono::Utc::now().format("D:%Y%m%d%H%M%SZ").to_string();
            entry.set("TU", Object::String(now.into_bytes(), StringFormat::Literal));
            vri.set(key, Object::Dictionary(entry));
        }
        dss.set("VRI", Object::Dictionary(vri));
        dss.set("Type", Object::Name(b"DSS".to_vec()));

        match existing_id {
            Some(id) => {
                modified.insert(id, Object::Dictionary(dss));
            }
            None => {
                let id = alloc.add(Object::Dictionary(dss));
                catalog.set("DSS", Object::Reference(id));
                let mut esic = Dictionary::new();
                esic.set("BaseVersion", Object::Name(b"1.7".to_vec()));
                esic.set("ExtensionLevel", Object::Integer(5));
                let mut ext = match catalog.get(b"Extensions") {
                    Ok(Object::Dictionary(d)) => d.clone(),
                    _ => Dictionary::new(),
                };
                ext.set("ESIC", Object::Dictionary(esic));
                catalog.set("Extensions", Object::Dictionary(ext));
                modified.insert(root_id, Object::Dictionary(catalog));
            }
        }
        Ok(())
    })
}

/// Collect validation data for the last signature in `pdf` and append a DSS update.
pub fn add_ltv_for_last_signature(pdf: &[u8], pool: &[Vec<u8>], http: &dyn Http) -> Result<(Vec<u8>, ValidationData)> {
    let sigs = signature_contents(pdf)?;
    let (cms, raw) = sigs.last().ok_or_else(|| Error::Ltv("no signature to extend".into()))?;
    let certs = certs_in_cms(cms)?;
    let data = collect_validation_data(&certs, pool, http);
    if data.certs.is_empty() {
        return Err(Error::Ltv("no certificates found in signature".into()));
    }
    let out = add_dss(pdf, &data, std::slice::from_ref(raw))?;
    Ok((out, data))
}

/// Append a document timestamp (SubFilter ETSI.RFC3161) covering the whole file (PAdES B-LTA).
pub fn add_document_timestamp(pdf: &[u8], tsa: &dyn Timestamper) -> Result<Vec<u8>> {
    let opts = SignOptions {
        kind: SignatureKind::DocTimeStamp,
        invisible: true,
        contents_reserve: Some(16384),
        ..Default::default()
    };
    let prepared = prepare(pdf, &opts)?;
    let digest = prepared.digest();
    let token = tsa.timestamp(&digest)?;
    prepared.embed(&token)
}
