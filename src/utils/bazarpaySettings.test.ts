import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isSafeQrImageUrl,
  normalizeBazarPaySettings,
} from './bazarpaySettings.ts';

test('isSafeQrImageUrl allows uploads/, https://, and data:image base64 while blocking unsafe schemes', () => {
  assert.equal(isSafeQrImageUrl('uploads/food_12345.png'), true);
  assert.equal(isSafeQrImageUrl('https://example.com/bangla-qr.png'), true);
  assert.equal(isSafeQrImageUrl('data:image/png;base64,iVBORw0KGgo='), true);
  assert.equal(isSafeQrImageUrl('javascript:alert(1)'), false);
  assert.equal(isSafeQrImageUrl('uploads/../etc/passwd'), false);
  assert.equal(isSafeQrImageUrl(''), false);
});

test('normalizeBazarPaySettings preserves valid QR image, EMVCo payload, and falls back to default receiver numbers', () => {
  const normalized = normalizeBazarPaySettings({
    banglaQrImageUrl: 'uploads/bangla_qr.png',
    banglaQrPayload: '  00020101021126300014BD.COM.BANGLAQR  ',
    receiverNumbers: {
      BKASH: '01700000001',
      NAGAD: '',
    },
  });

  assert.equal(normalized.banglaQrImageUrl, 'uploads/bangla_qr.png');
  assert.equal(normalized.banglaQrPayload, '00020101021126300014BD.COM.BANGLAQR');
  assert.equal(normalized.receiverNumbers.BKASH, '01700000001');
  assert.equal(normalized.receiverNumbers.NAGAD, '01840684615');
  assert.equal(normalized.receiverNumbers.ROCKET, '01840684615');
  assert.equal(normalized.receiverNumbers.BANGLA_QR, '01840684615');
});

test('normalizeBazarPaySettings strips unsafe QR image URLs', () => {
  const normalized = normalizeBazarPaySettings({
    banglaQrImageUrl: 'javascript:evil()',
  });
  assert.equal(normalized.banglaQrImageUrl, '');
});
