const {BITBOX} = require('bitbox-sdk');
const BigNumber = require('bignumber.js');

const bitbox = new BITBOX();

const {
  BCH, BCH_DERIVATION_PATH,
} = require('../constants');

const generateWallet = (chain, mnem) => {
  const mnemonic = mnem || bitbox.Mnemonic.generate();
  const rootSeedBuffer = bitbox.Mnemonic.toSeed(mnemonic);
  const hdNode = bitbox.HDNode.fromSeed(rootSeedBuffer, chain === BCH ? 'mainnet' : 'testnet');
  const path = bitbox.HDNode.derivePath(hdNode, BCH_DERIVATION_PATH);
  return {mnemonic, xpub: bitbox.HDNode.toXPub(path), xpriv: bitbox.HDNode.toXPriv(path)};
};

const calculateAddress = (xpub, index) => {
  const hdNode = bitbox.HDNode.fromXPub(xpub).derive(parseInt(index));
  return bitbox.HDNode.toCashAddress(hdNode);
};

const calculatePrivateKey = (chain, mnemonic, i) => {
  const hdNode = bitbox.HDNode.fromSeed(bitbox.Mnemonic.toSeed(mnemonic), chain === BCH ? 'mainnet' : 'testnet').derivePath(`${BCH_DERIVATION_PATH}/${i}`);
  return bitbox.HDNode.toWIF(hdNode);
};

const prepareTransaction = (data, out, chain, amount, mnemonic, keyPair, changeAddress) => {
  const tx = new bitbox.TransactionBuilder(chain === BCH ? 'mainnet' : 'testnet');
  data.forEach((input) => {
    if (input.vIn !== '-1') {
      tx.addInput(input.vIn, input.vInIndex);
    }
  });

  tx.addOutput(out, Number(new BigNumber(amount).multipliedBy(100000000).toFixed(8, BigNumber.ROUND_FLOOR)));
  if (mnemonic) {
    const {xpub} = generateWallet(chain, mnemonic);
    tx.addOutput(calculateAddress(xpub, chain, 0), Number(new BigNumber(data.find(d => d.vIn === '-1').amount).multipliedBy(100000000).toFixed(8, BigNumber.ROUND_FLOOR)));
  } else if (keyPair && changeAddress) {
    tx.addOutput(changeAddress, Number(new BigNumber(data.find(d => d.vIn === '-1').amount).multipliedBy(100000000).toFixed(8, BigNumber.ROUND_FLOOR)));
  } else {
    throw new Error('Impossible to prepare transaction. Either mnemonic or keyPair and attr must be present.');
  }
  data.forEach((input, i) => {
    // when there is no address field present, input is pool transfer to 0
    if (input.vIn === '-1') {
      return;
    }
    if (mnemonic) {
      const privateKey = calculatePrivateKey(chain, mnemonic, input.address && input.address.derivationKey ? input.address.derivationKey : 0);
      const ecPair = bitbox.ECPair.fromWIF(privateKey.key);
      tx.sign(i, ecPair, undefined, tx.hashTypes.SIGHASH_ALL, Number(data[i].amount), tx.signatureAlgorithms.SCHNORR);
    } else if (keyPair) {
      // @ts-ignore
      const privateKey = keyPair.find(k => k.address === input.address.address);
      if (privateKey) {
        const ecPair = bitbox.ECPair.fromWIF(privateKey.private);
        tx.sign(i, ecPair, undefined, tx.hashTypes.SIGHASH_ALL, Number(data[i].amount), tx.signatureAlgorithms.SCHNORR);
      }
    }
  });

  return tx.build().toHex();
};

module.exports = {
  generateWallet,
  calculateAddress,
  calculatePrivateKey,
  prepareTransaction,
};
