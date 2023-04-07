// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

// support multiple owners to manager
abstract contract SafeOwnableUpgradeable is Initializable, ContextUpgradeable {
    using ECDSA for bytes32;
    enum OpStatus {
        OpDefault,
        OpPending,
        OpExecuted,
        OpCancel
    }

    address[6] private _owners; // array of owners
    mapping(address => uint8) private _ownersIndex; // from 1
    uint8 private _numOwners; // number of owners
    uint8 public constant maxNumOwners = 5; // maximum number of owners
    // the number of owners that must confirm before operation run.
    uint8 public signRequired; // number of required confirmations
    mapping(bytes32 => OpStatus) public operationsStatus; // mapping of operation status

    uint256 public nonce; //avoid operation hash being the same

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event OperationAdded(bytes32 indexed opHash);

    /**
     * @dev Initializes the contract setting the deployer as the initial owner.
     */
    function __Ownable_init(address[] memory ownerList, uint8 signRequired_) internal onlyInitializing {
        require(ownerList.length > 0, "SafeOwnableUpgradeable: ownerList must be greater than 0");
        require(ownerList.length <= maxNumOwners, "SafeOwnableUpgradeable: exceed maximum number owners");
        require(signRequired_ != 0, "SafeOwnableUpgradeable: signRequired is zero");

        signRequired = signRequired_;
        for (uint256 i = 0; i < ownerList.length; i++) {
            address owner = ownerList[i];
            require(_ownersIndex[owner] == 0, "SafeOwnableUpgradeable: owner already exists");
            _owners[++_numOwners] = owner;
            _ownersIndex[owner] = _numOwners;

            emit OwnershipTransferred(address(0), owner);
        }

        require(signRequired <= _numOwners, "SafeOwnableUpgradeable: owners less than signRequired");
    }

    /**
     * @dev Modifier that allows only the owner to call the function.
     */
    modifier onlyOwner() {
        require(_ownersIndex[_msgSender()] > 0, "SafeOwnableUpgradeable: caller is not the owner");
        _;
    }

    /**
     * @dev Modifier that allows only multiple owners to call the function.
     * @param dataHash The hash of the operation to be confirmed.
     * @param sigs The signatures of the owners to confirm the operation.
     */
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
            require(ownerIndex > 0, "SafeOwnableUpgradeable: signer is not owner");
            if (mark[ownerIndex] == true) {
                continue;
            }
            mark[ownerIndex] = true;
            confirmed++;
        }

        require(confirmed >= signRequired, "SafeOwnableUpgradeable: not enough confirms");
        nonce++;
        _;
    }

    /**
     * @dev Modifier that allows only pending operations to call the function.
     * @param opHash The hash of the operation to be confirmed.
     */
    modifier onlyOperationPending(bytes32 opHash) {
        require(operationsStatus[opHash] == OpStatus.OpPending, "SafeOwnableUpgradeable: operation not in pending");
        operationsStatus[opHash] = OpStatus.OpExecuted;
        _;
    }

    /**
     * @dev Adds an operation hash to the pending list for confirmation by multiple owners.
     * @param opHash The hash of the operation to be added.
     * @param sigs The signatures of the owners to confirm the operation.
     */
    function AddOpHashToPending(bytes32 opHash, bytes[] memory sigs) public onlyMultipleOwner(opHash, sigs) {
        require(
            operationsStatus[opHash] == OpStatus.OpDefault,
            "SafeOwnableUpgradeable: operation was not submitted yet"
        );
        operationsStatus[opHash] = OpStatus.OpPending;
        emit OperationAdded(opHash);
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the current owner.
     */
    function transferOwnership(address newOwner) public virtual onlyOwner {
        require(newOwner != address(0), "SafeOwnableUpgradeable: new owner is the zero address");
        require(_ownersIndex[newOwner] == 0, "SafeOwnableUpgradeable: new owner already exists");

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

    /**
     * @dev Returns an array of all the owners of the contract.
     * @return An array of all the owners of the contract.
     */
    function owners() public view returns (address[6] memory) {
        return _owners;
    }

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[44] private __gap;
}
