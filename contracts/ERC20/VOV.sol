// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract VOV is ERC20, Ownable {
    bytes32 public constant MINTER_ROLE = keccak256("Minter");
    uint64 internal constant TWO_DAYs = 2 * 24 * 60 * 60;
    uint64 internal constant ONE_WEEK = 7 * 24 * 60 * 60;

    //events
    event EvOpenMint(address indexed whoOpen, uint64 indexed time);
    event EvNewMinter(address indexed whoUpdate, address indexed minter, uint64 indexed time);

    struct AccessRole {
        address addr;
        uint64 updateTime;
        bytes32 role;
    }

    struct MintBalance {
        uint256 balance;
        uint64 time;
    }

    mapping(bytes32 => AccessRole) public accessRoleMap;
    mapping(address => MintBalance) private mintBalances;

    bool public mintSwitch;
    uint64 public updateMintSwitchTime;

    constructor(address admin, address minter) ERC20("Vitality of VMeta3", "VOV") {
        accessRoleMap[MINTER_ROLE] = AccessRole({addr: minter, updateTime: 0, role: MINTER_ROLE});
        mintSwitch = true;
        transferOwnership(admin);
    }

    modifier onlyMinter() {
        require(
            msg.sender == accessRoleMap[MINTER_ROLE].addr &&
                _blockTimestamp() - accessRoleMap[MINTER_ROLE].updateTime >= TWO_DAYs,
            "VOV:only minter can do"
        );
        _;
    }

    modifier onlyCanMint() {
        require(mintSwitch == true && _blockTimestamp() - updateMintSwitchTime >= TWO_DAYs, "VOV:mint closed");
        _;
    }

    modifier checkUserMintDelayedBalance(address account) {
        if (mintBalances[account].balance > 0 && _blockTimestamp() - mintBalances[account].time >= ONE_WEEK) {
            uint256 balance = mintBalances[account].balance;
            mintBalances[account].balance = 0;
            _mint(account, balance);
        }
        _;
    }

    function decimals() public pure override returns (uint8) {
        return 1;
    }

    function _transfer(address from, address to, uint256 amount) internal override checkUserMintDelayedBalance(from) {
        super._transfer(from, to, amount);
    }

    function balanceOf(address account) public view override returns (uint256) {
        uint256 delayedBalance = 0;
        if (mintBalances[account].balance > 0 && _blockTimestamp() - mintBalances[account].time >= ONE_WEEK) {
            delayedBalance = mintBalances[account].balance;
        }

        return super.balanceOf(account) + delayedBalance;
    }

    function delayedMint(
        address account,
        uint256 amount
    ) external onlyMinter onlyCanMint checkUserMintDelayedBalance(account) {
        require(account != address(0), "VOV:mint to the zero address");
        require(_blockTimestamp() - mintBalances[account].time >= ONE_WEEK, "VOV:mint to recently");

        mintBalances[account].balance = amount;
        mintBalances[account].time = _blockTimestamp();
    }

    function updateMinter(address minter) external onlyOwner {
        require(accessRoleMap[MINTER_ROLE].addr != minter && minter != address(0));

        accessRoleMap[MINTER_ROLE].addr = minter;
        accessRoleMap[MINTER_ROLE].updateTime = _blockTimestamp();
        emit EvNewMinter(msg.sender, minter, _blockTimestamp());
    }

    function closeMint() external onlyOwner {
        require(mintSwitch == true, "VOV:closed");

        mintSwitch = false;
    }

    function openMint() external onlyOwner {
        require(mintSwitch == false, "VOV:opened");

        mintSwitch = true;
        updateMintSwitchTime = _blockTimestamp();
        emit EvOpenMint(msg.sender, updateMintSwitchTime);
    }

    /// @dev Returns the block timestamp truncated to 64 bits, i.e. mod 2**64. This method is overridden in tests.
    function _blockTimestamp() internal view virtual returns (uint64) {
        return uint64(block.timestamp); // truncation is desired
    }
}
