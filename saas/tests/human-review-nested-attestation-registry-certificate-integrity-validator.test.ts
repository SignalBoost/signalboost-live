import { describe, expect, it } from 'vitest';
import { validateEnterpriseHumanReviewNestedAttestationRegistryCertificateIntegrity } from '../lib/autonomous-systems/human-review-attestation-certificate-registry-attestation-registry-certificate-registry-attestation-registry-certificate-registry-attestation-registry-certificate-integrity-validator.ts';
import type { EnterpriseHumanReviewNestedAttestationRegistryCertificateSnapshot } from '../lib/autonomous-systems/human-review-attestation-certificate-registry-attestation-registry-certificate-registry-attestation-registry-certificate-registry-attestation-registry-certificate.ts';

const tenant={tenantId:'tenant-a',environmentId:'prod'};
function certificate(overrides:Partial<EnterpriseHumanReviewNestedAttestationRegistryCertificateSnapshot>={}): EnterpriseHumanReviewNestedAttestationRegistryCertificateSnapshot {
  return {schemaVersion:'1.0.0',certificateId:'cert-1',certificateSerial:'EAE-HRARR-ABC12345',tenant,registryId:'registry-1',validationId:'validation-1',issuerId:'issuer-1',disposition:'certified',attestationIds:['att-2','att-1'],evidenceRefs:['evidence-b','evidence-a'],readOnly:true,executable:false,...overrides};
}

describe('validateEnterpriseHumanReviewNestedAttestationRegistryCertificateIntegrity',()=>{
  it('creates deterministic normalized valid results',()=>{
    const request={tenant,certificate:certificate(),expectedIssuerId:'issuer-1',maxAttestationIds:8};
    const first=validateEnterpriseHumanReviewNestedAttestationRegistryCertificateIntegrity(request);
    const second=validateEnterpriseHumanReviewNestedAttestationRegistryCertificateIntegrity(request);
    expect(first).toEqual(second);
    expect(first.valid).toBe(true);
    expect(first.disposition).toBe('valid');
    expect(first.validatedAttestationIds).toEqual(['att-1','att-2']);
    expect(first.evidenceRefs).toEqual(['evidence-a','evidence-b']);
    expect(first.readOnly).toBe(true);
    expect(first.executable).toBe(false);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it('detects issuer, serial, identity, duplicate, and disposition inconsistencies',()=>{
    const result=validateEnterpriseHumanReviewNestedAttestationRegistryCertificateIntegrity({tenant,certificate:certificate({certificateId:'',certificateSerial:'bad',issuerId:'issuer-2',attestationIds:['att-1','att-1'],disposition:'empty'}),expectedIssuerId:'issuer-1',maxAttestationIds:8});
    expect(result.valid).toBe(false);
    expect(result.disposition).toBe('invalid');
    expect(result.errors).toEqual(expect.arrayContaining(['nested_attestation_registry_certificate_identity_required','issuer_id_mismatch','invalid_certificate_serial','duplicate_attestation_id','empty_certificate_contains_attestations']));
  });

  it('reports bounded truncation',()=>{
    const result=validateEnterpriseHumanReviewNestedAttestationRegistryCertificateIntegrity({tenant,certificate:certificate({attestationIds:['att-3','att-2','att-1']}),maxAttestationIds:2});
    expect(result.truncated).toBe(true);
    expect(result.validatedAttestationIds).toEqual(['att-2','att-3']);
  });

  it('rejects tenant, unsafe, and unbounded requests',()=>{
    expect(()=>validateEnterpriseHumanReviewNestedAttestationRegistryCertificateIntegrity({tenant,certificate:certificate({tenant:{tenantId:'tenant-b',environmentId:'prod'}}),maxAttestationIds:8})).toThrow('nested_attestation_registry_certificate_tenant_boundary_violation');
    expect(()=>validateEnterpriseHumanReviewNestedAttestationRegistryCertificateIntegrity({tenant,certificate:{...certificate(),readOnly:false as true},maxAttestationIds:8})).toThrow('unsafe_nested_attestation_registry_certificate_rejected');
    expect(()=>validateEnterpriseHumanReviewNestedAttestationRegistryCertificateIntegrity({tenant,certificate:certificate(),maxAttestationIds:513})).toThrow('unbounded_nested_attestation_registry_certificate_integrity_validation_rejected');
  });
});
