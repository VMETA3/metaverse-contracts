// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import "@openzeppelin/contracts/utils/Context.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

// support multiple owners to manager
abstract contract SafeOwnable is Context {
    using ECDSA for bytes32;
    enum OpStatus {
        OpDefault,
        OpPending,
        OpExecuted,
        OpCancel
    }

    address[6] private _owners;
    mapping(address => uint8) private _ownersIndex; // from 1
    uint8 private _numOwners;
    uint8 public constant maxNumOwners = 5;
    // the number of owners that must confirm before operation run.
    uint8 public immutable signRequired;
    mapping(bytes32 => OpStatus) public operationsStatus;

    uint256 public nonce; //avoid operation hash being the same

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event OperationAdded(bytes32 indexed opHash);

    constructor(address[] memory ownerList, uint8 signRequired_) {
        require(ownerList.length <= maxNumOwners, "SafeOwnable:exceed maximum number owners");
        require(signRequired_ != 0, "SafeOwnable: signRequired is zero");

        signRequired = signRequired_;
        for (uint256 i = 0; i < ownerList.length; i++) {
            address owner = ownerList[i];
            require(_ownersIndex[owner] == 0, "SafeOwnable: owner already exists");
            _owners[++_numOwners] = owner;
            _ownersIndex[owner] = _numOwners;

            emit OwnershipTransferred(address(0), owner);
        }

        require(signRequired <= _numOwners, "SafeOwnable: owners less than signRequired");
    }

    modifier onlyOwner() {
        require(_ownersIndex[_msgSender()] > 0, "SafeOwnable: caller is not the owner");
        _;
    }

    modifier onlyMultipleOwner(bytes32 dataHash, bytes[] memory sigs) {
        uint8 confirmed = 0;
        bool[maxNumOwners + 1] memory mark;
        if (_ownersIndex[_msgSender()] > 0) {
            confirmed++;
            mark[_ownersIndex[_msgSender()]] = true;
        }
        for (uint8 i = 0; i < sigs.length; i++) {
            address owner = dataHash.recover(sigs[i]);
            uint8 ownerIndex = _ownersIndex[owner];
            require(ownerIndex > 0, "SafeOwnable: signer is not owner");
            if (mark[ownerIndex] == true) {
                continue;
            }
            mark[ownerIndex] = true;
            confirmed++;
        }

        require(confirmed >= signRequired, "SafeOwnable: no enough confirms");
        nonce++;
        _;
    }

    modifier onlyOperationPendding(bytes32 opHash) {
        require(operationsStatus[opHash] == OpStatus.OpPending, "SafeOwnable: operation not in pending");
        operationsStatus[opHash] = OpStatus.OpExecuted;
        _;
    }

    function AddOpHashToPending(bytes32 opHash, bytes[] memory sigs) public onlyMultipleOwner(opHash, sigs) {
        require(operationsStatus[opHash] == OpStatus.OpDefault, "SafeOwnable: operation was not submitted yet");
        operationsStatus[opHash] = OpStatus.OpPending;
        emit OperationAdded(opHash);
    }

    modifier onlyMultipleOwnerIndependent(bytes32 dataHash, bytes[] memory sigs) {
        require(operationsStatus[dataHash] == OpStatus.OpDefault, "SafeOwnable: repetitive operation");
        uint8 confirmed = 0;
        bool[maxNumOwners + 1] memory mark;
        if (_ownersIndex[_msgSender()] > 0) {
            confirmed++;
            mark[_ownersIndex[_msgSender()]] = true;
        }
        for (uint8 i = 0; i < sigs.length; i++) {
            address owner = dataHash.recover(sigs[i]);
            uint8 ownerIndex = _ownersIndex[owner];
            require(ownerIndex > 0, "SafeOwnable: signer is not owner");
            if (mark[ownerIndex] == true) {
                continue;
            }
            mark[ownerIndex] = true;
            confirmed++;
        }
        require(confirmed >= signRequired, "SafeOwnable: no enough confirms");
        operationsStatus[dataHash] = OpStatus.OpExecuted;
        _;
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the current owner.
     */
    function transferOwnership(address newOwner) public virtual onlyOwner {
        require(newOwner != address(0), "SafeOwnable: new owner is the zero address");
        require(_ownersIndex[newOwner] == 0, "SafeOwnable: new owner already exists");

        _transferOwnership(newOwner);
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Internal function without access restriction.
     */
    function _transferOwnership(address newOwner) internal virtual {
        address oldOwner = _msgSender();
        uint8 oldOwnerIndex = _ownersIndex[oldOwner];
        _owners[oldOwnerIndex] = newOwner;
        _ownersIndex[oldOwner] = 0;
        _ownersIndex[newOwner] = oldOwnerIndex;

        emit OwnershipTransferred(oldOwner, newOwner);
    }

    function owners() public view returns (address[6] memory) {
        return _owners;
    }

    function HashToSign(bytes32 data) public pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", data));
    }
}
