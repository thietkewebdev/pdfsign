//! CMS SignedData for PAdES baseline (SubFilter ETSI.CAdES.detached).
//!
//! Signed attributes: content-type, message-digest, signing-certificate-v2 (ESSCertIDv2 with
//! SHA-256 cert hash + issuerSerial) and CMS algorithm protection (RFC 6211).
//! No signing-time attribute: PAdES baseline forbids it; the claimed time lives in /M.

use crate::error::{Error, Result};
use cms::cert::{CertificateChoices, IssuerAndSerialNumber};
use cms::content_info::{CmsVersion, ContentInfo};
use cms::signed_data::{
    CertificateSet, EncapsulatedContentInfo, SignedAttributes, SignedData, SignerIdentifier, SignerInfo,
    SignerInfos, UnsignedAttributes,
};
use const_oid::db::rfc5911::{ID_CONTENT_TYPE, ID_DATA, ID_MESSAGE_DIGEST, ID_SIGNED_DATA};
use const_oid::ObjectIdentifier;
use der::asn1::{OctetString, SetOfVec};
use der::{Any, Decode, Encode, Sequence};
use sha2::{Digest, Sha256};
use spki::AlgorithmIdentifierOwned;
use x509_cert::attr::Attribute;
use x509_cert::ext::pkix::name::GeneralName;
use x509_cert::serial_number::SerialNumber;
use x509_cert::Certificate;

pub const OID_SHA256: ObjectIdentifier = ObjectIdentifier::new_unwrap("2.16.840.1.101.3.4.2.1");
pub const OID_RSA_ENCRYPTION: ObjectIdentifier = ObjectIdentifier::new_unwrap("1.2.840.113549.1.1.1");
pub const OID_SHA256_WITH_RSA: ObjectIdentifier = ObjectIdentifier::new_unwrap("1.2.840.113549.1.1.11");
pub const OID_SIGNING_CERTIFICATE_V2: ObjectIdentifier =
    ObjectIdentifier::new_unwrap("1.2.840.113549.1.9.16.2.47");
pub const OID_CMS_ALGORITHM_PROTECTION: ObjectIdentifier = ObjectIdentifier::new_unwrap("1.2.840.113549.1.9.52");
pub const OID_SIGNATURE_TIME_STAMP_TOKEN: ObjectIdentifier =
    ObjectIdentifier::new_unwrap("1.2.840.113549.1.9.16.2.14");

/// Anything that can produce an RSA PKCS#1 v1.5 signature over a SHA-256 digest:
/// a PKCS#11 token, a software key, a remote signing service.
pub trait RawSigner {
    /// DER of the signing certificate.
    fn certificate_der(&self) -> Vec<u8>;
    /// Optional CA certificates to embed (chain), DER.
    fn chain_der(&self) -> Vec<Vec<u8>> {
        Vec::new()
    }
    /// Return the RSA PKCS#1 v1.5 signature of `digest` (the implementation wraps it in DigestInfo).
    fn sign_sha256_digest(&mut self, digest: &[u8; 32]) -> std::result::Result<Vec<u8>, String>;
}

/// Source of RFC 3161 timestamp tokens over a SHA-256 message imprint.
pub trait Timestamper {
    /// Returns the DER-encoded TimeStampToken (a CMS ContentInfo).
    fn timestamp(&self, sha256_imprint: &[u8; 32]) -> Result<Vec<u8>>;
}

#[derive(Sequence)]
struct IssuerSerial {
    issuer: Vec<GeneralName>,
    serial_number: SerialNumber,
}

/// ESSCertIDv2 with hashAlgorithm omitted (DEFAULT sha256, so DER must omit it).
#[derive(Sequence)]
struct EssCertIdV2 {
    cert_hash: OctetString,
    issuer_serial: Option<IssuerSerial>,
}

#[derive(Sequence)]
struct SigningCertificateV2 {
    certs: Vec<EssCertIdV2>,
}

#[derive(Sequence)]
struct CmsAlgorithmProtection {
    digest_algorithm: AlgorithmIdentifierOwned,
    #[asn1(context_specific = "1", tag_mode = "IMPLICIT", optional = "true")]
    signature_algorithm: Option<AlgorithmIdentifierOwned>,
}

fn sha256_alg() -> AlgorithmIdentifierOwned {
    AlgorithmIdentifierOwned { oid: OID_SHA256, parameters: None }
}

fn rsa_alg() -> AlgorithmIdentifierOwned {
    AlgorithmIdentifierOwned { oid: OID_SHA256_WITH_RSA, parameters: Some(Any::null()) }
}

fn attribute(oid: ObjectIdentifier, value: &impl Encode) -> Result<Attribute> {
    let any = Any::from_der(&value.to_der()?)?;
    Ok(Attribute { oid, values: SetOfVec::try_from(vec![any])? })
}

pub fn parse_certificate(der_bytes: &[u8]) -> Result<Certificate> {
    Certificate::from_der(der_bytes).map_err(|e| Error::Certificate(e.to_string()))
}

/// Build the signed attributes for `message_digest` (SHA-256 over the PDF ByteRange).
pub fn signed_attributes(cert: &Certificate, cert_der: &[u8], message_digest: &[u8; 32]) -> Result<SignedAttributes> {
    let ess = SigningCertificateV2 {
        certs: vec![EssCertIdV2 {
            cert_hash: OctetString::new(Sha256::digest(cert_der).to_vec())?,
            issuer_serial: Some(IssuerSerial {
                issuer: vec![GeneralName::DirectoryName(cert.tbs_certificate.issuer.clone())],
                serial_number: cert.tbs_certificate.serial_number.clone(),
            }),
        }],
    };
    let protection = CmsAlgorithmProtection { digest_algorithm: sha256_alg(), signature_algorithm: Some(rsa_alg()) };
    let attrs = vec![
        attribute(ID_CONTENT_TYPE, &ID_DATA)?,
        attribute(ID_MESSAGE_DIGEST, &OctetString::new(message_digest.to_vec())?)?,
        attribute(OID_SIGNING_CERTIFICATE_V2, &ess)?,
        attribute(OID_CMS_ALGORITHM_PROTECTION, &protection)?,
    ];
    Ok(SetOfVec::try_from(attrs)?)
}

/// Build a detached CAdES (CMS SignedData) for a PDF whose ByteRange digest is `message_digest`.
pub fn build_cades_detached(
    signer: &mut dyn RawSigner,
    message_digest: &[u8; 32],
    timestamper: Option<&dyn Timestamper>,
) -> Result<Vec<u8>> {
    let cert_der = signer.certificate_der();
    let cert = parse_certificate(&cert_der)?;

    let signed_attrs = signed_attributes(&cert, &cert_der, message_digest)?;
    let to_sign = signed_attrs.to_der()?;
    let attrs_digest: [u8; 32] = Sha256::digest(&to_sign).into();
    let signature = signer.sign_sha256_digest(&attrs_digest).map_err(Error::Signer)?;

    let unsigned_attrs: Option<UnsignedAttributes> = match timestamper {
        Some(tsa) => {
            let imprint: [u8; 32] = Sha256::digest(&signature).into();
            let token = tsa.timestamp(&imprint)?;
            let any = Any::from_der(&token)?;
            Some(SetOfVec::try_from(vec![Attribute {
                oid: OID_SIGNATURE_TIME_STAMP_TOKEN,
                values: SetOfVec::try_from(vec![any])?,
            }])?)
        }
        None => None,
    };

    let signer_info = SignerInfo {
        version: CmsVersion::V1,
        sid: SignerIdentifier::IssuerAndSerialNumber(IssuerAndSerialNumber {
            issuer: cert.tbs_certificate.issuer.clone(),
            serial_number: cert.tbs_certificate.serial_number.clone(),
        }),
        digest_alg: sha256_alg(),
        signed_attrs: Some(signed_attrs),
        signature_algorithm: rsa_alg(),
        signature: OctetString::new(signature)?,
        unsigned_attrs,
    };

    let mut seen: Vec<Vec<u8>> = Vec::new();
    let mut certs = Vec::new();
    for der_bytes in std::iter::once(cert_der.clone()).chain(signer.chain_der()) {
        if seen.contains(&der_bytes) {
            continue;
        }
        certs.push(CertificateChoices::Certificate(parse_certificate(&der_bytes)?));
        seen.push(der_bytes);
    }

    let signed_data = SignedData {
        version: CmsVersion::V1,
        digest_algorithms: SetOfVec::try_from(vec![sha256_alg()])?,
        encap_content_info: EncapsulatedContentInfo { econtent_type: ID_DATA, econtent: None },
        certificates: Some(CertificateSet(SetOfVec::try_from(certs)?)),
        crls: None,
        signer_infos: SignerInfos(SetOfVec::try_from(vec![signer_info])?),
    };
    let ci = ContentInfo { content_type: ID_SIGNED_DATA, content: Any::encode_from(&signed_data)? };
    Ok(ci.to_der()?)
}
