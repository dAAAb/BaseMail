// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

/**
 * @title DonateBuyRegistrar
 * @notice Proxy-buy Basenames with a donation fee. Atomic: register + donate in one tx.
 * @dev Calls the Base UpgradeableRegistrarController.register() and forwards
 *      the donation surplus to the treasury.
 */
contract DonateBuyRegistrar {
    // ── Base Registrar Controller (proxy) ──
    address public constant REGISTRAR = 0xa7d2607c6BD39Ae9521e514026CBB078405Ab322;
    address public constant L2_RESOLVER = 0x426fA03fB86E510d0Dd9F70335Cf102a98b10875;

    address public immutable treasury;
    address public owner;
    uint256 public donationBps = 1500; // 15% default

    event DonateBuy(
        string indexed nameHash,
        string name,
        address indexed recipient,
        uint256 price,
        uint256 donation,
        address indexed buyer
    );
    event DonationBpsUpdated(uint256 oldBps, uint256 newBps);
    event OwnerTransferred(address indexed oldOwner, address indexed newOwner);

    error InsufficientPayment(uint256 required, uint256 sent);
    error NameUnavailable(string name);
    error OnlyOwner();
    error InvalidBps();
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    constructor(address _treasury) {
        treasury = _treasury;
        owner = msg.sender;
    }

    /**
     * @notice Get the total cost: registration price + donation
     * @param name The Basename label (without .base.eth)
     * @param duration Registration duration in seconds
     * @return price Base registration price
     * @return donation Donation amount
     * @return total Total ETH required
     */
    function quote(string calldata name, uint256 duration) external view returns (
        uint256 price,
        uint256 donation,
        uint256 total
    ) {
        price = IRegistrar(REGISTRAR).registerPrice(name, duration);
        donation = (price * donationBps) / 10000;
        total = price + donation;
    }

    /**
     * @notice Buy a Basename for `recipient` with donation
     * @param name The Basename label (e.g. "myagent", not "myagent.base.eth")
     * @param recipient Address that will own the Basename NFT
     * @param duration Registration duration in seconds (31536000 = 1 year)
     * @param resolverData Encoded resolver calls (setAddr, setName, etc.)
     */
    function donateBuy(
        string calldata name,
        address recipient,
        uint256 duration,
        bytes[] calldata resolverData
    ) external payable {
        // 1. Check availability
        if (!IRegistrar(REGISTRAR).available(name)) {
            revert NameUnavailable(name);
        }

        // 2. Get price and calculate donation
        uint256 price = IRegistrar(REGISTRAR).registerPrice(name, duration);
        uint256 donation = (price * donationBps) / 10000;
        uint256 total = price + donation;

        // Add 5% buffer for price fluctuation (refund excess)
        uint256 priceWithBuffer = price + (price / 20);

        if (msg.value < total) {
            revert InsufficientPayment(total, msg.value);
        }

        // 3. Register Basename (atomic — reverts if fails)
        IRegistrar(REGISTRAR).register{value: priceWithBuffer}(
            IRegistrar.RegisterRequest({
                name: name,
                owner: recipient,
                duration: duration,
                resolver: L2_RESOLVER,
                data: resolverData,
                reverseRecord: true,
                coinTypes: new uint256[](0),
                signatureExpiry: 0,
                signature: ""
            })
        );

        // 4. Send donation to treasury
        uint256 actualDonation = msg.value - priceWithBuffer;
        if (actualDonation > 0) {
            (bool sent, ) = treasury.call{value: actualDonation}("");
            if (!sent) revert TransferFailed();
        }

        // 5. Refund any excess (from buffer)
        // Note: the registrar may refund excess to this contract
        uint256 remaining = address(this).balance;
        if (remaining > 0) {
            (bool refunded, ) = msg.sender.call{value: remaining}("");
            if (!refunded) revert TransferFailed();
        }

        emit DonateBuy(name, name, recipient, price, donation, msg.sender);
    }

    // ── Admin ──

    function setDonationBps(uint256 _bps) external onlyOwner {
        if (_bps > 5000) revert InvalidBps(); // Max 50%
        emit DonationBpsUpdated(donationBps, _bps);
        donationBps = _bps;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        emit OwnerTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @notice Rescue stuck ETH (from registrar refunds)
    function rescue() external onlyOwner {
        (bool sent, ) = treasury.call{value: address(this).balance}("");
        if (!sent) revert TransferFailed();
    }

    receive() external payable {} // Accept registrar refunds
}

// ── Interface for Base Registrar Controller ──
interface IRegistrar {
    struct RegisterRequest {
        string name;
        address owner;
        uint256 duration;
        address resolver;
        bytes[] data;
        bool reverseRecord;
        uint256[] coinTypes;
        uint256 signatureExpiry;
        bytes signature;
    }

    function register(RegisterRequest calldata request) external payable;
    function registerPrice(string calldata name, uint256 duration) external view returns (uint256);
    function available(string calldata name) external view returns (bool);
}
