// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import "@gnus.ai/contracts-upgradeable-diamond/contracts/utils/ContextUpgradeable.sol";
import {ECDSAUpgradeable} from "@gnus.ai/contracts-upgradeable-diamond/contracts/utils/cryptography/ECDSAUpgradeable.sol";
import "@gnus.ai/contracts-upgradeable-diamond/contracts/proxy/utils/Initializable.sol";

library SafeOwnableStorage {
    enum OpStatus {
        OpDefault,
        OpPending,
        OpExecuted,
        OpCancel
    }

    struct Layout {
        address[6] owners;
        mapping(address => uint8) ownersIndex; // from 1
        uint8 numOwners;
        // the number of owners that must confirm before operation run.
        uint8 signRequired;
        mapping(bytes32 => OpStatus) operationsStatus;
        uint256 nonce; //avoid operation hash being the same
    }

    bytes32 internal constant STORAGE_SLOT = keccak256("vmeta3.SafeOwnable");

    function layout() internal pure returns (Layout storage l) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            l.slot := slot
        }
    }
}

// support multiple owners to manager
abstract contract SafeOwnableUpgradeable is Initializable, ContextUpgradeable {
    using ECDSAUpgradeable for bytes32;

    uint8 public constant maxNumOwners = 5;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event OperationAdded(bytes32 indexed opHash);

    function __Ownable_init(address[] memory ownerList, uint8 signRequired_) internal onlyInitializing {
        SafeOwnableStorage.Layout storage l = SafeOwnableStorage.layout();

        require(ownerList.length <= maxNumOwners, "SafeOwnable:exceed maximum number owners");
        require(signRequired_ != 0, "SafeOwnable: signRequired is zero");

        l.signRequired = signRequired_;
        for (uint256 i = 0; i < ownerList.length; i++) {
            address owner = ownerList[i];
            require(l.ownersIndex[owner] == 0, "SafeOwnable: owner already exists");
            l.owners[++l.numOwners] = owner;
            l.ownersIndex[owner] = l.numOwners;

            emit OwnershipTransferred(address(0), owner);
        }

        require(l.signRequired <= l.numOwners, "SafeOwnable: owners less than signRequired");
    }

    modifier onlyOwner() {
        require(SafeOwnableStorage.layout().ownersIndex[_msgSender()] > 0, "SafeOwnable: caller is not the owner");
        _;
    }

    modifier onlyMultipleOwner(bytes32 dataHash, bytes[] memory sigs) {
        SafeOwnableStorage.Layout storage l = SafeOwnableStorage.layout();

        uint8 confirmed = 0;
        bool[maxNumOwners + 1] memory mark;
        if (l.ownersIndex[_msgSender()] > 0) {
            confirmed++;
            mark[l.ownersIndex[_msgSender()]] = true;
        }
        for (uint8 i = 0; i < sigs.length; i++) {
            address owner = dataHash.recover(sigs[i]);
            uint8 ownerIndex = l.ownersIndex[owner];
            require(ownerIndex > 0, "SafeOwnable: signer is not owner");
            if (mark[ownerIndex] == true) {
                continue;
            }
            mark[ownerIndex] = true;
            confirmed++;
        }

        require(confirmed >= l.signRequired, "SafeOwnable: no enough confirms");
        l.nonce++;
        _;
    }

    modifier onlyOperationPendding(bytes32 opHash) {
        SafeOwnableStorage.Layout storage l = SafeOwnableStorage.layout();

        require(
            l.operationsStatus[opHash] == SafeOwnableStorage.OpStatus.OpPending,
            "SafeOwnable: operation not in pending"
        );
        l.operationsStatus[opHash] = SafeOwnableStorage.OpStatus.OpExecuted;
        _;
    }

    function AddOpHashToPending(bytes32 opHash, bytes[] memory sigs) public onlyMultipleOwner(opHash, sigs) {
        SafeOwnableStorage.Layout storage l = SafeOwnableStorage.layout();
        require(
            l.operationsStatus[opHash] == SafeOwnableStorage.OpStatus.OpDefault,
            "SafeOwnable: operation was not submitted yet"
        );
        l.operationsStatus[opHash] = SafeOwnableStorage.OpStatus.OpPending;
        emit OperationAdded(opHash);
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the current owner.
     */
    function transferOwnership2(address newOwner) public virtual onlyOwner {
        require(newOwner != address(0), "SafeOwnable: new owner is the zero address");
        require(SafeOwnableStorage.layout().ownersIndex[newOwner] == 0, "SafeOwnable: new owner already exists");

        _transferOwnership(newOwner);
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Internal function without access restriction.
     */
    function _transferOwnership(address newOwner) internal virtual {
        SafeOwnableStorage.Layout storage l = SafeOwnableStorage.layout();

        address oldOwner = _msgSender();
        uint8 oldOwnerIndex = l.ownersIndex[oldOwner];
        l.owners[oldOwnerIndex] = newOwner;
        l.ownersIndex[oldOwner] = 0;
        l.ownersIndex[newOwner] = oldOwnerIndex;

        emit OwnershipTransferred(oldOwner, newOwner);
    }

    function owners() public view returns (address[6] memory) {
        return SafeOwnableStorage.layout().owners;
    }

    function nonce() public view returns (uint256) {
        return SafeOwnableStorage.layout().nonce;
    }
}
